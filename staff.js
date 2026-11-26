/*
  Раздел для персонала (/staff): вход, заказы и их статусы, отчёты, выгрузка в Excel, сотрудники,
  живые обновления (Server-Sent Events). Все запросы — /api/staff/…; работает, только когда включена база (ORDERS_DB).

  Доступ: владелец видит все рестораны и управляет сотрудниками; менеджер видит и ведёт заказы только своей точки.
  Вход — по логину и паролю, сессия в cookie (HttpOnly, SameSite=Strict). Изменения принимаются только
  с заголовком X-PV-Staff (чужой сайт не может отправить такой запрос от имени сотрудника).
*/
"use strict";

const COOKIE = "pv_staff";
const LABEL = { new: "Новый", accepted: "Принят", cooking: "Готовится", delivering: "В пути", ready: "Готов к выдаче", done: "Выполнен", cancelled: "Отменён" };
// Куда можно перевести заказ. Шаги можно пропускать (например, сразу «Готовится»), отмена — с причиной.
const NEXT = {
  new: ["accepted", "cooking", "cancelled"],
  accepted: ["cooking", "delivering", "ready", "cancelled"],
  cooking: ["delivering", "ready", "done", "cancelled"],
  delivering: ["done", "cancelled"],
  ready: ["done", "cancelled"],
  done: [],
  cancelled: []
};
// Владелец может исправить ошибку: вернуть закрытый заказ в работу или отменить выполненный
const OWNER_NEXT = { done: ["accepted", "cancelled"], cancelled: ["accepted"] };

function createStaff({ db, loadMenu, send, readBody, siteUrl }) {
  const clients = new Set(); // открытые живые обновления: { res, user }
  const fails = new Map();   // неудачные входы: ключ → времена

  const ping = setInterval(() => { for (const c of clients) c.res.write(": ping\n\n"); }, 25000);
  ping.unref();

  /* ---------- общее ---------- */
  const cookies = req => {
    const out = {};
    for (const part of String(req.headers.cookie || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  };
  const isHttps = req => req.headers["x-forwarded-proto"] === "https" || !!req.socket.encrypted;
  const setCookie = (req, res, value, maxAge) =>
    res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? "; Secure" : ""}`);
  const ok = (res, data) => { res.setHeader("Cache-Control", "no-store"); send(res, 200, { ok: true, ...data }); };
  const fail = (res, code, error, extra) => { res.setHeader("Cache-Control", "no-store"); send(res, code, { ok: false, error, ...extra }); };
  const ipOf = req => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
  const json = async req => { try { return JSON.parse(await readBody(req, 20000) || "{}"); } catch { return null; } };

  function locations() {
    return (loadMenu().cfg.locations || []).map(l => ({ id: l.id, name: l.name || l.id, address: l.address || "" }));
  }
  // Ресторан, по которому смотрим: у менеджера — всегда свой, у владельца — выбранный или все
  function scopePoint(user, wanted) {
    if (user.role === "manager") return user.point;
    return locations().some(l => l.id === wanted) ? wanted : null;
  }
  const canSee = (user, order) => order && (user.role === "owner" || order.point === user.point);

  // Не больше 8 неудачных попыток за 15 минут — и по адресу, и по логину
  function blocked(keys) {
    const now = Date.now(), win = 15 * 60 * 1000;
    return keys.some(k => (fails.get(k) || []).filter(t => now - t < win).length >= 8);
  }
  function noteFail(keys) {
    const now = Date.now(), win = 15 * 60 * 1000;
    for (const k of keys) fails.set(k, [...(fails.get(k) || []).filter(t => now - t < win), now]);
  }

  function broadcast(evt) {
    const data = `event: order\ndata: ${JSON.stringify(evt)}\n\n`;
    for (const c of clients) {
      if (c.user.role === "manager" && c.user.point !== evt.point) continue;
      c.res.write(data);
    }
  }

  /* ---------- выгрузка для Excel: CSV с «;», BOM и переводами строк Windows ---------- */
  const fmtMsk = iso => {
    const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString();
    return { date: d.slice(0, 10).split("-").reverse().join("."), time: d.slice(11, 16) };
  };
  const cell = v => {
    const s = String(v ?? "");
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function toCsv(orders) {
    const head = ["№", "Дата", "Время", "Ресторан", "Способ", "Статус", "Причина отмены", "Гость", "Телефон", "Адрес", "К какому времени",
      "Оплата", "Состав", "Блюда, ₽", "Скидка, ₽", "Промокод", "Доставка, ₽", "Итого, ₽", "Комментарий"];
    const rows = orders.map(o => {
      const t = fmtMsk(o.createdAt);
      const a = o.address ? [o.address.street, o.address.flat && `кв. ${o.address.flat}`, o.address.entrance && `подъезд ${o.address.entrance}`, o.address.floor && `этаж ${o.address.floor}`].filter(Boolean).join(", ") : "";
      return [o.id, t.date, t.time, o.pointName || o.point || "", o.method === "pickup" ? "Самовывоз" : "Доставка", LABEL[o.status] || o.status, o.cancelReason,
        o.name, o.phone, a, o.time === "asap" ? "Как можно скорее" : o.time,
        o.payment === "cash" ? "Наличными" + (o.change ? ` (сдача с ${o.change})` : "") : "Картой при получении",
        (o.items || []).map(i => `${i.name} × ${i.qty}`).join("; "), o.subtotal, o.discount, o.coupon, o.delivery, o.total, o.comment];
    });
    return "﻿" + [head, ...rows].map(r => r.map(cell).join(";")).join("\r\n") + "\r\n";
  }

  /* ---------- маршруты ---------- */
  async function handle(req, res) {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;
    if (!p.startsWith("/api/staff/")) return false;
    const route = p.slice("/api/staff/".length);
    const post = req.method === "POST";
    if (post && req.headers["x-pv-staff"] !== "1") { fail(res, 403, "Запрос отклонён"); return true; }

    // Вход
    if (post && route === "login") {
      const body = await json(req);
      const login = String(body && body.login || "").trim().slice(0, 60);
      const keys = ["ip:" + ipOf(req), "login:" + login.toLowerCase()];
      if (blocked(keys)) { fail(res, 429, "Слишком много попыток. Подождите 15 минут"); return true; }
      const s = body && db.login(login, String(body.password || "").slice(0, 200));
      if (!s) { noteFail(keys); fail(res, 401, "Неверный логин или пароль"); return true; }
      setCookie(req, res, s.token, s.maxAge);
      console.log(`[staff] вход: ${s.staff.login} (${s.staff.role}${s.staff.point ? ", " + s.staff.point : ""})`);
      ok(res, { user: s.staff });
      return true;
    }
    if (post && route === "logout") {
      db.logout(cookies(req)[COOKIE]);
      setCookie(req, res, "", 0);
      ok(res, {});
      return true;
    }

    const user = db.sessionStaff(cookies(req)[COOKIE]);
    if (!user) { fail(res, 401, "Нужно войти"); return true; }

    if (req.method === "GET" && route === "me") {
      ok(res, { user, points: locations(), labels: LABEL, today: db.mskToday(), newCount: db.newCount(scopePoint(user, null)) });
      return true;
    }

    // Живые обновления: о новом заказе и смене статуса браузер узнаёт сразу
    if (req.method === "GET" && route === "stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 4000\n\n");
      const c = { res, user };
      clients.add(c);
      req.on("close", () => clients.delete(c));
      return true;
    }

    // Список заказов
    if (req.method === "GET" && route === "orders") {
      const sp = url.searchParams;
      const scope = ["active", "done", "cancelled", "all"].includes(sp.get("scope")) ? sp.get("scope") : "active";
      const point = scopePoint(user, sp.get("point"));
      const orders = db.listOrders({ scope, from: sp.get("from") || sp.get("date"), to: sp.get("to") || sp.get("date"), point, q: sp.get("q") });
      ok(res, { orders, newCount: db.newCount(point) });
      return true;
    }

    // Один заказ и смена статуса
    let m = /^orders\/(\d{1,9})$/.exec(route);
    if (req.method === "GET" && m) {
      const o = db.getOrder(m[1]);
      if (!canSee(user, o)) { fail(res, 404, "Заказ не найден"); return true; }
      ok(res, { order: o, next: nextFor(user, o) });
      return true;
    }
    m = /^orders\/(\d{1,9})\/status$/.exec(route);
    if (post && m) {
      const o = db.getOrder(m[1]);
      if (!canSee(user, o)) { fail(res, 404, "Заказ не найден"); return true; }
      const body = await json(req) || {};
      const to = String(body.status || "");
      const note = String(body.reason || "").trim().slice(0, 200);
      if (!nextFor(user, o).includes(to)) { fail(res, 409, `Заказ сейчас «${LABEL[o.status]}» — так перевести нельзя`, { order: o }); return true; }
      if (to === "cancelled" && note.length < 2) { fail(res, 422, "Укажите причину отмены"); return true; }
      const order = db.setStatus(o.id, to, user.id, to === "cancelled" ? note : null);
      console.log(`[staff] заказ №${o.id}: ${o.status} → ${to} (${user.login})`);
      broadcast({ type: "status", id: o.id, point: o.point, status: to });
      ok(res, { order, next: nextFor(user, order) });
      return true;
    }

    // Отчёт и выгрузка
    if (req.method === "GET" && route === "report") {
      const sp = url.searchParams;
      ok(res, { report: db.report({ from: sp.get("from"), to: sp.get("to"), point: scopePoint(user, sp.get("point")) }) });
      return true;
    }
    if (req.method === "GET" && route === "export.csv") {
      const sp = url.searchParams;
      const r = db.range(sp.get("from"), sp.get("to"));
      const point = scopePoint(user, sp.get("point"));
      const csv = toCsv(db.listOrders({ scope: "all", from: r.from, to: r.to, point, limit: 20000 }).reverse());
      const name = `zakazy_${point || "vse"}_${r.from}_${r.to}.csv`;
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(csv);
      console.log(`[staff] выгрузка ${name} (${user.login})`);
      return true;
    }

    // Сотрудники — только владелец
    if (route === "users" || route.startsWith("users/")) {
      if (user.role !== "owner") { fail(res, 403, "Доступно только владельцу"); return true; }
      const pts = locations();
      if (req.method === "GET" && route === "users") { ok(res, { users: db.listStaff() }); return true; }
      if (post && route === "users") {
        const b = await json(req) || {};
        const login = String(b.login || "").trim();
        const name = String(b.name || "").trim().slice(0, 60);
        const role = b.role === "owner" ? "owner" : "manager";
        if (!/^[a-zA-Z0-9._-]{3,30}$/.test(login)) { fail(res, 422, "Логин: 3–30 латинских букв, цифр, точек или дефисов"); return true; }
        if (name.length < 2) { fail(res, 422, "Укажите имя"); return true; }
        if (role === "manager" && !pts.some(x => x.id === b.point)) { fail(res, 422, "Выберите ресторан"); return true; }
        if (db.findStaffByLogin(login)) { fail(res, 409, "Такой логин уже есть"); return true; }
        const r = db.addStaff({ login, name, role, point: b.point });
        console.log(`[staff] добавлен сотрудник ${login} (${role}) — ${user.login}`);
        ok(res, { user: db.listStaff().find(u => u.id === r.id), password: r.password });
        return true;
      }
      m = /^users\/(\d{1,9})$/.exec(route);
      if (post && m) {
        const target = db.getStaff(m[1]);
        if (!target) { fail(res, 404, "Сотрудник не найден"); return true; }
        const b = await json(req) || {};
        if (b.resetPassword) {
          const password = db.resetPassword(target.id);
          console.log(`[staff] новый пароль для ${target.login} — ${user.login}`);
          ok(res, { password });
          return true;
        }
        if (b.active === false && target.id === user.id) { fail(res, 422, "Нельзя отключить самого себя"); return true; }
        if (b.active === false && target.role === "owner" && db.countOwners() <= 1) { fail(res, 422, "Нужен хотя бы один владелец"); return true; }
        if (b.point !== undefined && target.role === "manager" && !pts.some(x => x.id === b.point)) { fail(res, 422, "Выберите ресторан"); return true; }
        const updated = db.updateStaff(target.id, { name: b.name, point: b.point, active: b.active === undefined ? undefined : !!b.active });
        ok(res, { user: updated });
        return true;
      }
    }

    fail(res, 404, "Не найдено");
    return true;
  }

  function nextFor(user, o) {
    const list = [...(NEXT[o.status] || [])];
    if (user.role === "owner") for (const s of OWNER_NEXT[o.status] || []) if (!list.includes(s)) list.push(s);
    // «В пути» — только для доставки, «Готов к выдаче» — только для самовывоза
    return list.filter(s => !(s === "delivering" && o.method === "pickup") && !(s === "ready" && o.method === "delivery"));
  }

  // Короткое уведомление в Telegram — без имени, телефона и адреса гостя
  function alertText(o, esc, rub) {
    return [
      `🆕 <b>Новый заказ №${o.id}</b>`,
      `${o.method === "pickup" ? "🏃 Самовывоз" : "🚚 Доставка"}${o.point ? ` · ${esc(o.point.name)}` : ""}`,
      `💰 ${rub(o.total)} · ${o.time === "asap" ? "как можно скорее" : "к " + esc(o.time)}`,
      siteUrl ? `Открыть: ${siteUrl}/staff#${o.id}` : "Откройте раздел «Заказы» в приложении"
    ].join("\n");
  }

  return { handle, broadcast, alertText };
}

module.exports = { createStaff, LABEL };
