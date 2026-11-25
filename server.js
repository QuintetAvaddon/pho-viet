/*
  Сервер сайта Phở Việt.
  - раздаёт сайт из папки public
  - принимает заказы (POST /api/order) и отправляет их в Telegram
  - принимает заявки на работу (POST /api/job) и отправляет их в Telegram ресторана
  - принимает сообщения бота (POST /api/tg): в группе бот отвечает ID чата и к какому ресторану он привязан

  Запуск:            node server.js
  Узнать chat_id:    node server.js chat-id
  Настройки — в файле .env (см. .env.example). Зависимостей нет, нужен Node.js 18+.
*/
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

/* ---------- .env ---------- */
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || "").split(",").map(s => s.trim()).filter(Boolean);
const TG_API = (process.env.TELEGRAM_API || "https://api.telegram.org").replace(/\/$/, "");
const PUBLIC_DIR = path.join(__dirname, "public");
// Адрес сайта для webhook бота. Render задаёт RENDER_EXTERNAL_URL сам.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
// Секрет webhook: Telegram присылает его в заголовке — чужие запросы на /api/tg отклоняются
const HOOK_SECRET = BOT_TOKEN ? crypto.createHash("sha256").update("pv-hook:" + BOT_TOKEN).digest("hex").slice(0, 48) : "";

/* ---------- Меню (цены берём с сервера, а не из браузера) ---------- */
function loadMenu() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, "menu.js"), "utf8"), ctx);
  const w = ctx.window;
  return { cfg: w.SITE_CONFIG, byId: Object.fromEntries(w.MENU.map(d => [d.id, d])) };
}

/* ---------- Часы приёма заказов (тот же код, что на сайте: public/hours.js) ---------- */
const HOURS = (() => {
  const ctx = { window: {}, Date }; // часы процесса сервера, а не отдельной песочницы vm
  vm.runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, "hours.js"), "utf8"), ctx);
  return ctx.window.PV_HOURS;
})();

/* ---------- Промокоды (тот же код, что на сайте: public/coupons.js) ---------- */
const COUPON = (() => {
  const ctx = { window: {}, Date };
  vm.runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, "coupons.js"), "utf8"), ctx);
  return ctx.window.PV_COUPON;
})();

/* ---------- Telegram ---------- */
async function tg(method, body) {
  const r = await fetch(`${TG_API}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) {
    const err = new Error(`Telegram ${method}: ${j.description || r.status}`);
    err.parameters = j.parameters || {};
    throw err;
  }
  return j.result;
}

// Отправка в чат; если группа стала супергруппой, Telegram даёт новый ID — шлём туда и пишем в лог
async function sendToChat(chat_id, text) {
  const body = { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true };
  try {
    return await tg("sendMessage", body);
  } catch (e) {
    const moved = e.parameters && e.parameters.migrate_to_chat_id;
    if (!moved) throw e;
    console.warn(`[telegram] группа ${chat_id} стала супергруппой, новый ID ${moved} — обновите переменную на Render`);
    return tg("sendMessage", { ...body, chat_id: moved });
  }
}

const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const rub = n => n.toLocaleString("ru-RU") + " ₽";
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

function buildOrder(input, menu) {
  const errors = [];
  const method = input.method === "pickup" ? "pickup" : "delivery";
  const name = clip(input.customer?.name, 60);
  const phoneDigits = String(input.customer?.phone || "").replace(/\D/g, "");
  if (name.length < 2) errors.push("name");
  if (phoneDigits.length !== 11) errors.push("phone");
  if (input.consent !== true) errors.push("consent");

  const address = method === "delivery" ? {
    street: clip(input.address?.street, 150),
    flat: clip(input.address?.flat, 10),
    entrance: clip(input.address?.entrance, 10),
    floor: clip(input.address?.floor, 10)
  } : null;
  if (address && address.street.length < 5) errors.push("street");

  // Ресторан (и для самовывоза, и для доставки) должен быть из списка в menu.js
  const locs = Array.isArray(menu.cfg.locations) ? menu.cfg.locations : [];
  let point = null, closed = null;
  if (locs.length) {
    const l = locs.find(x => x.id === input.point);
    if (!l) errors.push("point");
    else {
      point = { id: l.id, name: l.name || l.metro || l.id, address: l.address || "" };
      // Заказы — только в часы приёма точки: с открытия до закрытия минус orderCutoffMin (по Москве)
      const cutoff = menu.cfg.orderCutoffMin ?? 30;
      const w = HOURS.orderWindow(l, cutoff);
      if (!HOURS.acceptsNow(l, cutoff)) { errors.push("closed"); closed = w ? `с ${HOURS.fmt(w.from)} до ${HOURS.fmt(w.last)}` : ""; }
      else if (!HOURS.validTime(l, cutoff, clip(input.time, 20) || "asap")) errors.push("time");
    }
  }

  const items = [];
  for (const it of Array.isArray(input.items) ? input.items.slice(0, 60) : []) {
    const d = menu.byId[it?.id];
    const qty = Math.floor(Number(it?.qty));
    if (!d || !(qty >= 1 && qty <= 99)) { errors.push("items"); break; }
    items.push({ name: d.name, price: d.price, qty });
  }
  if (!items.length) errors.push("items");

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = method === "pickup" || subtotal >= menu.cfg.freeDeliveryFrom ? 0 : menu.cfg.deliveryFee;
  // Промокод: скидка от суммы блюд, проверка как на сайте; примеры (demo) не действуют
  let coupon = null, couponError = "";
  const couponCode = clip(input.coupon, 30);
  if (couponCode) {
    const r = COUPON.check(couponCode, subtotal, menu.cfg.promos);
    if (r.ok) coupon = { code: r.code, discount: r.discount };
    else { errors.push("coupon"); couponError = r.message; }
  }
  const discount = coupon ? coupon.discount : 0;
  return {
    errors, closed, couponError,
    order: {
      id: String(Date.now()).slice(-6),
      method, name,
      phone: "+" + phoneDigits,
      address, point,
      time: clip(input.time, 20) || "asap",
      payment: input.payment === "cash" ? "cash" : "card",
      change: clip(input.change, 12),
      comment: clip(input.comment, 500),
      items, subtotal, coupon: coupon && coupon.code, discount, delivery, total: subtotal - discount + delivery
    }
  };
}

function formatMessage(o) {
  const lines = [
    `🍜 <b>Новый заказ №${o.id}</b>`,
    o.method === "pickup"
      ? `🏃 <b>Самовывоз</b>${o.point ? ` — ${esc(o.point.name)}, ${esc(o.point.address)}` : ""}`
      : `🚚 <b>Доставка</b>${o.point ? ` · ресторан: ${esc(o.point.name)}` : ""}`,
    "",
    `👤 ${esc(o.name)}`,
    `📞 <a href="tel:${o.phone}">${esc(o.phone)}</a>`
  ];
  if (o.address) {
    const extra = [o.address.flat && `кв. ${o.address.flat}`, o.address.entrance && `подъезд ${o.address.entrance}`, o.address.floor && `этаж ${o.address.floor}`].filter(Boolean).join(", ");
    lines.push(`📍 ${esc(o.address.street)}${extra ? ", " + esc(extra) : ""}`);
  }
  lines.push(`⏰ ${o.time === "asap" ? "Как можно скорее" : "К " + esc(o.time)}`);
  lines.push(`💳 ${o.payment === "cash" ? "Наличными" + (o.change ? ` (сдача с ${esc(o.change)})` : "") : "Картой при получении"}`);
  if (o.comment) lines.push(`💬 ${esc(o.comment)}`);
  lines.push("", "<b>Состав:</b>");
  for (const i of o.items) lines.push(`• ${esc(i.name)} × ${i.qty} — ${rub(i.price * i.qty)}`);
  lines.push("", `Блюда: ${rub(o.subtotal)}`);
  if (o.discount) lines.push(`🎟 Промокод ${esc(o.coupon)}: −${rub(o.discount)}`);
  if (o.method === "delivery") lines.push(`Доставка: ${o.delivery ? rub(o.delivery) : "бесплатно"}`);
  lines.push(`<b>Итого: ${rub(o.total)}</b>`);
  return lines.join("\n");
}

/* ---------- Ограничение частоты: 5 заказов за 10 минут с одного IP ---------- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  return list.length > 5;
}

/* ---------- HTTP ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json; charset=utf-8", ".json": "application/json; charset=utf-8" };

function send(res, code, data, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
  res.end(typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Куда слать заказ: в чат выбранного ресторана (TELEGRAM_CHAT_ID_P1 …); если он не задан — в общий TELEGRAM_CHAT_ID
function chatsFor(order) {
  if (order.point) {
    const own = (process.env["TELEGRAM_CHAT_ID_" + order.point.id.toUpperCase()] || "").split(",").map(s => s.trim()).filter(Boolean);
    if (own.length) return own;
  }
  return CHAT_IDS;
}

async function handleOrder(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) return send(res, 429, { ok: false, error: "Слишком много заказов подряд. Позвоните нам, пожалуйста." });

  let input;
  try { input = JSON.parse(await readBody(req)); } catch { return send(res, 400, { ok: false, error: "Некорректный запрос" }); }

  const { errors, closed, couponError, order } = buildOrder(input, loadMenu());
  if (errors.includes("closed")) {
    return send(res, 422, { ok: false, code: "closed", error: `Сейчас этот ресторан не принимает заказы${closed ? `. Приём заказов ${closed}` : ""}` });
  }
  if (errors.includes("time")) return send(res, 422, { ok: false, code: "time", error: "Выбранное время уже недоступно — выберите другое" });
  if (errors.includes("coupon")) return send(res, 422, { ok: false, code: "coupon", error: couponError || "Промокод не действует" });
  if (errors.length) return send(res, 422, { ok: false, error: "Проверьте данные заказа", fields: errors });

  const chats = chatsFor(order);
  if (!BOT_TOKEN || !chats.length) {
    console.error("Заказ не отправлен: не заданы TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID в .env");
    return send(res, 503, { ok: false, error: "Приём заказов временно не настроен" });
  }
  try {
    const text = formatMessage(order);
    await Promise.all(chats.map(chat_id => sendToChat(chat_id, text)));
    console.log(`Заказ №${order.id} на ${order.total} ₽ отправлен в Telegram`);
    send(res, 200, { ok: true, id: order.id, total: order.total });
  } catch (e) {
    console.error(e.message);
    send(res, 502, { ok: false, error: "Не удалось передать заказ в ресторан" });
  }
}

/* ---------- Заявки на работу ---------- */
const yearsWord = n => (n % 10 === 1 && n % 100 !== 11) ? "год" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? "года" : "лет";

// Куда слать заявку: в отдельный чат TELEGRAM_CHAT_ID_JOBS, если он задан, иначе — в чат выбранного ресторана
function jobChats(loc) {
  const own = (process.env.TELEGRAM_CHAT_ID_JOBS || "").split(",").map(s => s.trim()).filter(Boolean);
  return own.length ? own : chatsFor({ point: { id: loc.id } });
}

async function handleJob(req, res) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited("job:" + ip)) return send(res, 429, { ok: false, error: "Слишком много заявок подряд. Позвоните нам, пожалуйста" });

  let input;
  try { input = JSON.parse(await readBody(req)); } catch { return send(res, 400, { ok: false, error: "Некорректный запрос" }); }

  const menu = loadMenu();
  const positions = (menu.cfg.jobs && menu.cfg.jobs.positions) || [];
  const name = clip(input.name, 60);
  const phone = String(input.phone || "").replace(/\D/g, "");
  const position = clip(input.position, 60);
  const loc = (menu.cfg.locations || []).find(l => l.id === input.point);
  const ageRaw = clip(input.age, 3);
  const age = ageRaw ? Math.floor(Number(ageRaw)) : null;
  const about = clip(input.about, 1000);
  const errors = [];
  if (name.length < 2) errors.push("name");
  if (phone.length !== 11) errors.push("phone");
  if (!position || (positions.length && !positions.includes(position))) errors.push("position");
  if (!loc) errors.push("point");
  if (ageRaw && !(age >= 14 && age <= 75)) errors.push("age");
  if (input.consent !== true) errors.push("consent");
  if (errors.length) return send(res, 422, { ok: false, error: "Проверьте данные заявки", fields: errors });

  const chats = jobChats(loc);
  if (!BOT_TOKEN || !chats.length) {
    console.error("Заявка на работу не отправлена: не настроен Telegram");
    return send(res, 503, { ok: false, error: "Приём заявок временно не работает" });
  }
  const text = [
    "📝 <b>Заявка на работу</b>",
    `💼 ${esc(position)} · ${esc(loc.name || loc.id)}`,
    "",
    `👤 ${esc(name)}${age ? `, ${age} ${yearsWord(age)}` : ""}`,
    `📞 <a href="tel:+${phone}">+${phone}</a>`,
    ...(about ? [`💬 ${esc(about)}`] : [])
  ].join("\n");
  try {
    await Promise.all(chats.map(chat_id => sendToChat(chat_id, text)));
    console.log(`Заявка на работу: ${position}, ${loc.name || loc.id}`); // без имени и телефона в логах
    send(res, 200, { ok: true });
  } catch (e) {
    console.error(e.message);
    send(res, 502, { ok: false, error: "Не удалось передать заявку" });
  }
}

/* ---------- Бот в группах ---------- */
function pointsForChat(chatId) {
  const locs = loadMenu().cfg.locations || [];
  return locs.filter(l => (process.env["TELEGRAM_CHAT_ID_" + l.id.toUpperCase()] || "").split(",").map(s => s.trim()).includes(String(chatId)));
}

function chatInfoText(chat) {
  const pts = pointsForChat(chat.id);
  const lines = [`ID этого чата: <code>${chat.id}</code>`];
  if (chat.title) lines.push(`Группа: ${esc(chat.title)}`);
  lines.push(pts.length
    ? `✅ Сюда приходят заказы: ${pts.map(p => esc(p.name || p.id)).join(", ")}`
    : "Заказы сюда пока не приходят — этот чат ещё не привязан к ресторану.");
  return lines.join("\n");
}

async function handleTelegram(req, res) {
  if (!BOT_TOKEN || req.headers["x-telegram-bot-api-secret-token"] !== HOOK_SECRET) return send(res, 403, { ok: false });
  let upd;
  try { upd = JSON.parse(await readBody(req, 200000)); } catch { return send(res, 400, { ok: false }); }
  send(res, 200, { ok: true }); // отвечаем Telegram сразу, дальше — асинхронно
  try {
    const mcm = upd.my_chat_member;
    const isIn = s => s === "member" || s === "administrator";
    if (mcm && isIn(mcm.new_chat_member && mcm.new_chat_member.status) && !isIn(mcm.old_chat_member && mcm.old_chat_member.status)) {
      console.log(`[telegram] бот добавлен: чат ${mcm.chat.id} «${mcm.chat.title || ""}»`);
      await tg("sendMessage", { chat_id: mcm.chat.id, text: "Привет! Я бот заказов Phở Việt 🍜\n" + chatInfoText(mcm.chat), parse_mode: "HTML" });
    }
    const msg = upd.message;
    if (msg && msg.text && /^\/(id|start)(@\w+)?(\s|$)/i.test(msg.text)) {
      console.log(`[telegram] /id: чат ${msg.chat.id} «${msg.chat.title || msg.chat.first_name || ""}»`);
      await tg("sendMessage", { chat_id: msg.chat.id, text: chatInfoText(msg.chat), parse_mode: "HTML" });
    }
    if (msg && msg.migrate_to_chat_id) {
      console.warn(`[telegram] группа ${msg.chat.id} «${msg.chat.title || ""}» стала супергруппой, новый ID ${msg.migrate_to_chat_id}`);
    }
  } catch (e) {
    console.error("[telegram]", e.message);
  }
}

async function setupWebhook() {
  if (!BOT_TOKEN || !PUBLIC_URL) return;
  try {
    await tg("setWebhook", { url: PUBLIC_URL + "/api/tg", secret_token: HOOK_SECRET, allowed_updates: ["message", "my_chat_member"] });
    const me = await tg("getMe");
    console.log(`[telegram] бот @${me.username} подключён, webhook: ${PUBLIC_URL}/api/tg`);
  } catch (e) {
    console.error("[telegram] не удалось настроить webhook:", e.message);
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  // вкладки приложения — одна страница: главная (/app), меню (/menu) и акции (/promo) переключаются без загрузки
  if (urlPath === "/app" || urlPath === "/promo") urlPath = "/menu";
  if (urlPath.endsWith("/")) urlPath += "index.html";
  if (!path.extname(urlPath)) urlPath += ".html"; // /menu -> menu.html
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    // service worker и страницы не кэшируем в браузере, чтобы обновления доходили сразу
    if (/\.(html|js|webmanifest)$/.test(file)) res.setHeader("Cache-Control", "no-cache");
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
  });
}

async function printChatIds() {
  if (!BOT_TOKEN) { console.log("Сначала впишите TELEGRAM_BOT_TOKEN в файл .env"); return; }
  const me = await tg("getMe");
  const updates = await tg("getUpdates");
  const chats = new Map();
  for (const u of updates) {
    const c = (u.message || u.channel_post || u.my_chat_member)?.chat;
    if (c) chats.set(c.id, c.title || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username);
  }
  console.log(`Бот: @${me.username}`);
  if (!chats.size) {
    console.log("Сообщений пока нет. Напишите боту /start (или добавьте его в группу и напишите там), затем запустите команду снова.");
    return;
  }
  console.log("Найденные чаты (впишите нужный id в TELEGRAM_CHAT_ID):");
  for (const [id, name] of chats) console.log(`  ${id}  —  ${name}`);
}

if (process.argv[2] === "chat-id") {
  printChatIds().catch(e => { console.error(e.message); process.exit(1); });
} else {
  http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/order") return handleOrder(req, res).catch(e => { console.error(e); send(res, 500, { ok: false, error: "Ошибка сервера" }); });
    if (req.method === "POST" && req.url === "/api/job") return handleJob(req, res).catch(e => { console.error(e); send(res, 500, { ok: false, error: "Ошибка сервера" }); });
    if (req.method === "POST" && req.url === "/api/tg") return handleTelegram(req, res).catch(e => { console.error(e); try { send(res, 500, { ok: false }); } catch {} });
    // раньше приложение запускалось с /menu?source=app — теперь стартовая страница приложения /app
    if (req.method === "GET" && /^\/menu(\.html)?\?(.*&)?source=app(&|$)/.test(req.url)) {
      res.writeHead(302, { Location: "/app?source=app", "Cache-Control": "no-store" });
      return res.end();
    }
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    send(res, 405, "Method not allowed", "text/plain");
  }).listen(PORT, () => {
    console.log(`Сайт: http://localhost:${PORT}`);
    if (!BOT_TOKEN) console.log("ВНИМАНИЕ: Telegram не настроен — задайте TELEGRAM_BOT_TOKEN (см. README)");
    setupWebhook();
  });
}
