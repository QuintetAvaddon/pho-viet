/*
  База заказов Phở Việt — один файл SQLite на диске сервера (модуль node:sqlite встроен в Node 22.13+/24, зависимостей нет).
  Включается переменной ORDERS_DB=/путь/orders.db (без неё сайт работает как раньше: заказы только в Telegram).

  Таблицы: staff (владелец и менеджеры), sessions (входы), orders (заказы), order_items (состав),
  order_events (история статусов: кто и когда). Время храним в UTC (ISO-строки), а сутки и месяцы
  в отчётах считаем по Москве: UTC+3 круглый год.
*/
"use strict";

const crypto = require("crypto");

const MSK_MS = 3 * 3600 * 1000;
const MSK_SQL = "'+3 hours'";
const STATUSES = ["new", "accepted", "cooking", "delivering", "ready", "done", "cancelled"];
const ACTIVE = ["new", "accepted", "cooking", "delivering", "ready"];
const SESSION_DAYS = 30;

/* ---------- Схема. Новые изменения — только новым элементом в конце списка ---------- */
const MIGRATIONS = [
  `
  CREATE TABLE staff (
    id INTEGER PRIMARY KEY,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager')),
    point TEXT,
    pass_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    created_at TEXT NOT NULL,
    point TEXT,
    point_name TEXT,
    method TEXT NOT NULL CHECK (method IN ('delivery', 'pickup')),
    status TEXT NOT NULL DEFAULT 'new',
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    time TEXT NOT NULL,
    payment TEXT NOT NULL,
    change TEXT,
    comment TEXT,
    subtotal INTEGER NOT NULL,
    discount INTEGER NOT NULL DEFAULT 0,
    coupon TEXT,
    delivery INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    cancel_reason TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX orders_created ON orders(created_at);
  CREATE INDEX orders_point_created ON orders(point, created_at);
  CREATE INDEX orders_status ON orders(status);
  CREATE TABLE order_items (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dish_id TEXT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL
  );
  CREATE INDEX order_items_order ON order_items(order_id);
  CREATE TABLE order_events (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    note TEXT
  );
  CREATE INDEX order_events_order ON order_events(order_id);
  `
];

/* ---------- Пароли: scrypt с солью; сравнение за постоянное время ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${crypto.scryptSync(String(pw), salt, 32).toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, "hex"), 32);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const DUMMY_HASH = hashPassword("pv-timing-dummy"); // чтобы вход с несуществующим логином шёл столько же времени
// Пароль для выдачи сотруднику: 10 знаков без похожих букв и цифр (l/1, o/0)
function newPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += abc[crypto.randomInt(abc.length)];
  return s;
}
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");
const nowIso = () => new Date().toISOString();

/* ---------- Даты по Москве ---------- */
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
function mskToday() {
  return new Date(Date.now() + MSK_MS).toISOString().slice(0, 10);
}
// начало московских суток в UTC (ISO) — для сравнения с created_at
function mskDayStart(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - MSK_MS).toISOString();
}
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
// период [from; to] включительно (московские даты) → границы в UTC; неверные даты — сегодня
function range(from, to) {
  const f = isDay(from) ? from : mskToday();
  let t = isDay(to) ? to : f;
  if (t < f) t = f;
  return { from: f, to: t, start: mskDayStart(f), end: mskDayStart(addDays(t, 1)) };
}

/* ---------- Открытие ---------- */
function open(file) {
  // node:sqlite пишет в журнал «экспериментальная функция» — это предупреждение там не нужно
  const emit = process.emitWarning;
  process.emitWarning = (w, ...a) => (/SQLite/i.test(String(w && w.message || w)) ? undefined : emit.call(process, w, ...a));
  let DatabaseSync;
  try { ({ DatabaseSync } = require("node:sqlite")); } finally { process.emitWarning = emit; }

  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  migrate(db);
  return makeApi(db, file);
}

function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)");
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema'").get();
  let v = row ? Number(row.value) : 0;
  while (v < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[v]);
      v++;
      db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(v));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

const n0 = v => Number(v) || 0;
const inList = arr => arr.map(s => `'${s}'`).join(","); // только для констант ACTIVE/STATUSES

function rowToOrder(r) {
  if (!r) return null;
  let address = null;
  try { address = r.address ? JSON.parse(r.address) : null; } catch { address = null; }
  let items;
  if (r.items_json !== undefined) { try { items = JSON.parse(r.items_json || "[]"); } catch { items = []; } }
  return {
    id: r.id, createdAt: r.created_at, updatedAt: r.updated_at,
    point: r.point, pointName: r.point_name, method: r.method, status: r.status,
    name: r.name, phone: r.phone, address, time: r.time, payment: r.payment,
    change: r.change || "", comment: r.comment || "",
    subtotal: r.subtotal, discount: r.discount, coupon: r.coupon || "", delivery: r.delivery, total: r.total,
    cancelReason: r.cancel_reason || "",
    ...(items ? { items } : {})
  };
}
const staffPublic = r => r && ({ id: r.id, login: r.login, name: r.name, role: r.role, point: r.point || null, active: !!r.active, createdAt: r.created_at });

function makeApi(db, file) {
  const q = sql => db.prepare(sql);
  const ITEMS_JSON = "(SELECT json_group_array(json_object('name', i.name, 'qty', i.qty, 'price', i.price)) FROM order_items i WHERE i.order_id = o.id) AS items_json";

  /* ----- сотрудники и входы ----- */
  function addStaff({ login, name, role, point }) {
    const password = newPassword();
    const r = q("INSERT INTO staff (login, name, role, point, pass_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(String(login).trim(), String(name || login).trim(), role, role === "manager" ? point : null, hashPassword(password), nowIso());
    return { id: Number(r.lastInsertRowid), password };
  }
  function findStaffByLogin(login) { return q("SELECT * FROM staff WHERE login = ?").get(String(login || "").trim()) || null; }
  function getStaff(id) { return q("SELECT * FROM staff WHERE id = ?").get(Number(id)) || null; }
  function listStaff() { return q("SELECT * FROM staff ORDER BY role DESC, point, name").all().map(staffPublic); }
  function countOwners() { return n0(q("SELECT COUNT(*) AS n FROM staff WHERE role = 'owner' AND active = 1").get().n); }
  function updateStaff(id, { name, point, active }) {
    const s = getStaff(id); if (!s) return null;
    q("UPDATE staff SET name = ?, point = ?, active = ? WHERE id = ?").run(
      name !== undefined ? String(name).trim() || s.name : s.name,
      s.role === "manager" ? (point !== undefined ? point : s.point) : null,
      active !== undefined ? (active ? 1 : 0) : s.active,
      s.id);
    if (active === false) q("DELETE FROM sessions WHERE staff_id = ?").run(s.id);
    return staffPublic(getStaff(id));
  }
  function resetPassword(id) {
    const password = newPassword();
    q("UPDATE staff SET pass_hash = ? WHERE id = ?").run(hashPassword(password), Number(id));
    q("DELETE FROM sessions WHERE staff_id = ?").run(Number(id));
    return password;
  }
  function login(loginName, password) {
    const s = findStaffByLogin(loginName);
    const ok = checkPassword(password, s ? s.pass_hash : DUMMY_HASH);
    if (!s || !ok || !s.active) return null;
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    q("DELETE FROM sessions WHERE expires_at < ?").run(new Date(now).toISOString());
    q("INSERT INTO sessions (token_hash, staff_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(sha(token), s.id, new Date(now).toISOString(), new Date(now + SESSION_DAYS * 864e5).toISOString());
    return { token, staff: staffPublic(s), maxAge: SESSION_DAYS * 86400 };
  }
  function sessionStaff(token) {
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    const r = q("SELECT s.* FROM sessions x JOIN staff s ON s.id = x.staff_id WHERE x.token_hash = ? AND x.expires_at > ? AND s.active = 1")
      .get(sha(token), nowIso());
    return staffPublic(r);
  }
  function logout(token) { if (token) q("DELETE FROM sessions WHERE token_hash = ?").run(sha(token)); }

  /* ----- заказы ----- */
  function saveOrder(o) {
    return tx(db, () => {
      const at = nowIso();
      const r = q(`INSERT INTO orders (created_at, point, point_name, method, status, name, phone, address, time, payment, change, comment,
                   subtotal, discount, coupon, delivery, total, updated_at) VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(at, o.point ? o.point.id : null, o.point ? o.point.name : null, o.method, o.name, o.phone,
          o.address ? JSON.stringify(o.address) : null, o.time, o.payment, o.change || null, o.comment || null,
          o.subtotal, o.discount || 0, o.coupon || null, o.delivery || 0, o.total, at);
      const id = Number(r.lastInsertRowid);
      const item = q("INSERT INTO order_items (order_id, dish_id, name, price, qty) VALUES (?, ?, ?, ?, ?)");
      for (const i of o.items) item.run(id, i.id || null, i.name, i.price, i.qty);
      q("INSERT INTO order_events (order_id, at, staff_id, status, note) VALUES (?, ?, NULL, 'new', NULL)").run(id, at);
      return { id, createdAt: at };
    });
  }

  // Список: активные — за любые дни (их нужно закрыть), остальные — за период. point — фильтр по ресторану.
  function listOrders({ scope = "active", from, to, point, q: search, limit = 300 } = {}) {
    const where = [], args = [];
    if (scope === "active") where.push(`o.status IN (${inList(ACTIVE)})`);
    else {
      const r = range(from, to);
      where.push("o.created_at >= ? AND o.created_at < ?"); args.push(r.start, r.end);
      if (scope === "done") where.push("o.status = 'done'");
      if (scope === "cancelled") where.push("o.status = 'cancelled'");
    }
    if (point) { where.push("o.point = ?"); args.push(point); }
    const s = String(search || "").trim();
    if (s) {
      const digits = s.replace(/\D/g, "");
      const parts = ["o.name LIKE ?"]; args.push(`%${s}%`);
      if (digits) {
        parts.push("o.phone LIKE ?"); args.push(`%${digits}%`);
        if (digits.length <= 7) { parts.push("o.id = ?"); args.push(Number(digits)); }
      }
      where.push(`(${parts.join(" OR ")})`);
    }
    args.push(Math.min(Math.max(Number(limit) || 300, 1), 20000));
    return q(`SELECT o.*, ${ITEMS_JSON} FROM orders o ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY o.id DESC LIMIT ?`)
      .all(...args).map(rowToOrder);
  }

  function getOrder(id) {
    const o = rowToOrder(q(`SELECT o.*, ${ITEMS_JSON} FROM orders o WHERE o.id = ?`).get(Number(id)));
    if (!o) return null;
    o.events = q("SELECT e.at, e.status, e.note, s.name AS who FROM order_events e LEFT JOIN staff s ON s.id = e.staff_id WHERE e.order_id = ? ORDER BY e.id")
      .all(o.id).map(e => ({ at: e.at, status: e.status, note: e.note || "", who: e.who || "" }));
    return o;
  }

  function setStatus(id, status, staffId, note) {
    if (!STATUSES.includes(status)) throw new Error("bad status");
    return tx(db, () => {
      const at = nowIso();
      q("UPDATE orders SET status = ?, cancel_reason = ?, updated_at = ? WHERE id = ?")
        .run(status, status === "cancelled" ? (note || null) : null, at, Number(id));
      q("INSERT INTO order_events (order_id, at, staff_id, status, note) VALUES (?, ?, ?, ?, ?)").run(Number(id), at, staffId || null, status, note || null);
      return getOrder(id);
    });
  }

  function newCount(point) {
    return n0((point ? q("SELECT COUNT(*) AS n FROM orders WHERE status = 'new' AND point = ?").get(point)
      : q("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'").get()).n);
  }

  /* ----- отчёт за период ----- */
  function report({ from, to, point } = {}) {
    const r = range(from, to);
    const w = "o.created_at >= ? AND o.created_at < ?" + (point ? " AND o.point = ?" : "");
    const a = point ? [r.start, r.end, point] : [r.start, r.end];
    const DONE_SUM = "SUM(CASE WHEN o.status = 'done' THEN o.total ELSE 0 END)";
    const t = q(`SELECT COUNT(*) AS orders,
        SUM(o.status = 'done') AS done, SUM(o.status = 'cancelled') AS cancelled, SUM(o.status IN (${inList(ACTIVE)})) AS active,
        ${DONE_SUM} AS revenue,
        SUM(CASE WHEN o.status = 'cancelled' THEN o.total ELSE 0 END) AS cancelled_sum,
        SUM(CASE WHEN o.status IN (${inList(ACTIVE)}) THEN o.total ELSE 0 END) AS active_sum,
        SUM(CASE WHEN o.status = 'done' THEN o.discount ELSE 0 END) AS discount,
        SUM(CASE WHEN o.status = 'done' THEN o.delivery ELSE 0 END) AS delivery_fees
      FROM orders o WHERE ${w}`).get(...a);
    const totals = {
      orders: n0(t.orders), done: n0(t.done), cancelled: n0(t.cancelled), active: n0(t.active),
      revenue: n0(t.revenue), cancelledSum: n0(t.cancelled_sum), activeSum: n0(t.active_sum),
      discount: n0(t.discount), deliveryFees: n0(t.delivery_fees)
    };
    totals.avg = totals.done ? Math.round(totals.revenue / totals.done) : 0;

    const byDay = new Map(q(`SELECT date(o.created_at, ${MSK_SQL}) AS d, COUNT(*) AS orders, SUM(o.status = 'done') AS done,
        SUM(o.status = 'cancelled') AS cancelled, ${DONE_SUM} AS revenue FROM orders o WHERE ${w} GROUP BY d`).all(...a).map(x => [x.d, x]));
    const days = [];
    for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
      const x = byDay.get(d) || {};
      days.push({ date: d, orders: n0(x.orders), done: n0(x.done), cancelled: n0(x.cancelled), revenue: n0(x.revenue) });
      if (days.length > 400) break;
    }
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 }));
    for (const x of q(`SELECT CAST(strftime('%H', o.created_at, ${MSK_SQL}) AS INTEGER) AS h, COUNT(*) AS orders, ${DONE_SUM} AS revenue
        FROM orders o WHERE ${w} GROUP BY h`).all(...a)) hours[x.h] = { hour: x.h, orders: n0(x.orders), revenue: n0(x.revenue) };

    const points = q(`SELECT o.point AS id, MAX(o.point_name) AS name, COUNT(*) AS orders, SUM(o.status = 'done') AS done,
        SUM(o.status = 'cancelled') AS cancelled, ${DONE_SUM} AS revenue FROM orders o WHERE ${w} GROUP BY o.point ORDER BY revenue DESC`)
      .all(...a).map(x => ({ id: x.id, name: x.name || x.id || "—", orders: n0(x.orders), done: n0(x.done), cancelled: n0(x.cancelled), revenue: n0(x.revenue), avg: n0(x.done) ? Math.round(n0(x.revenue) / n0(x.done)) : 0 }));
    const methods = q(`SELECT o.method AS id, COUNT(*) AS orders, SUM(o.status = 'done') AS done, ${DONE_SUM} AS revenue FROM orders o WHERE ${w} GROUP BY o.method`)
      .all(...a).map(x => ({ id: x.id, orders: n0(x.orders), done: n0(x.done), revenue: n0(x.revenue) }));
    const payments = q(`SELECT o.payment AS id, COUNT(*) AS done, SUM(o.total) AS revenue FROM orders o WHERE ${w} AND o.status = 'done' GROUP BY o.payment`)
      .all(...a).map(x => ({ id: x.id, done: n0(x.done), revenue: n0(x.revenue) }));
    const dishes = q(`SELECT i.name, SUM(i.qty) AS qty, SUM(i.qty * i.price) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE ${w} AND o.status = 'done' GROUP BY i.name ORDER BY qty DESC, revenue DESC LIMIT 15`)
      .all(...a).map(x => ({ name: x.name, qty: n0(x.qty), revenue: n0(x.revenue) }));
    const coupons = q(`SELECT o.coupon AS code, COUNT(*) AS uses, SUM(o.discount) AS discount FROM orders o
        WHERE ${w} AND o.status = 'done' AND o.coupon IS NOT NULL GROUP BY o.coupon ORDER BY uses DESC`)
      .all(...a).map(x => ({ code: x.code, uses: n0(x.uses), discount: n0(x.discount) }));
    const reasons = q(`SELECT COALESCE(NULLIF(o.cancel_reason, ''), 'Без причины') AS reason, COUNT(*) AS count, SUM(o.total) AS sum FROM orders o
        WHERE ${w} AND o.status = 'cancelled' GROUP BY reason ORDER BY count DESC`)
      .all(...a).map(x => ({ reason: x.reason, count: n0(x.count), sum: n0(x.sum) }));
    return { from: r.from, to: r.to, point: point || null, totals, days, hours, points, methods, payments, dishes, coupons, reasons };
  }

  // Резервная копия: целостный снимок базы в отдельный файл (можно делать на ходу)
  function backup(toFile) { db.exec(`VACUUM INTO '${String(toFile).replace(/'/g, "''")}'`); }

  return {
    file, STATUSES, ACTIVE, mskToday, range,
    addStaff, findStaffByLogin, getStaff, listStaff, countOwners, updateStaff, resetPassword,
    login, sessionStaff, logout,
    saveOrder, listOrders, getOrder, setStatus, newCount, report, backup,
    close: () => db.close()
  };
}

module.exports = { open, hashPassword, checkPassword, newPassword, STATUSES, ACTIVE };
