/*
  Сервер сайта Phở Việt.
  - раздаёт сайт из папки public
  - принимает заказы (POST /api/order) и отправляет их в Telegram

  Запуск:            node server.js
  Узнать chat_id:    node server.js chat-id
  Настройки — в файле .env (см. .env.example). Зависимостей нет, нужен Node.js 18+.
*/
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

/* ---------- Меню (цены берём с сервера, а не из браузера) ---------- */
function loadMenu() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, "menu.js"), "utf8"), ctx);
  const w = ctx.window;
  return { cfg: w.SITE_CONFIG, byId: Object.fromEntries(w.MENU.map(d => [d.id, d])) };
}

/* ---------- Telegram ---------- */
async function tg(method, body) {
  const r = await fetch(`${TG_API}/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
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

  const address = method === "delivery" ? {
    street: clip(input.address?.street, 150),
    flat: clip(input.address?.flat, 10),
    entrance: clip(input.address?.entrance, 10),
    floor: clip(input.address?.floor, 10)
  } : null;
  if (address && address.street.length < 5) errors.push("street");

  // Самовывоз: точка должна быть из списка ресторанов в menu.js
  const locs = Array.isArray(menu.cfg.locations) ? menu.cfg.locations : [];
  let point = null;
  if (method === "pickup" && locs.length) {
    const l = locs.find(x => x.id === input.point);
    if (!l) errors.push("point");
    else point = { id: l.id, name: l.name || l.metro || l.id, address: l.address || "" };
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
  return {
    errors,
    order: {
      id: String(Date.now()).slice(-6),
      method, name,
      phone: "+" + phoneDigits,
      address, point,
      time: clip(input.time, 20) || "asap",
      payment: input.payment === "cash" ? "cash" : "card",
      change: clip(input.change, 12),
      comment: clip(input.comment, 500),
      items, subtotal, delivery, total: subtotal + delivery
    }
  };
}

function formatMessage(o) {
  const lines = [
    `🍜 <b>Новый заказ №${o.id}</b>`,
    o.method === "pickup" ? `🏃 <b>Самовывоз</b>${o.point ? ` — ${esc(o.point.name)}, ${esc(o.point.address)}` : ""}` : "🚚 <b>Доставка</b>",
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

// Куда слать заказ: самовывоз — в чат точки (TELEGRAM_CHAT_ID_P1 …), если он задан; остальное — в общий TELEGRAM_CHAT_ID
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

  const { errors, order } = buildOrder(input, loadMenu());
  if (errors.length) return send(res, 422, { ok: false, error: "Проверьте данные заказа", fields: errors });

  const chats = chatsFor(order);
  if (!BOT_TOKEN || !chats.length) {
    console.error("Заказ не отправлен: не заданы TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID в .env");
    return send(res, 503, { ok: false, error: "Приём заказов временно не настроен" });
  }
  try {
    const text = formatMessage(order);
    await Promise.all(chats.map(chat_id => tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true })));
    console.log(`Заказ №${order.id} на ${order.total} ₽ отправлен в Telegram`);
    send(res, 200, { ok: true, id: order.id, total: order.total });
  } catch (e) {
    console.error(e.message);
    send(res, 502, { ok: false, error: "Не удалось передать заказ в ресторан" });
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
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
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    send(res, 405, "Method not allowed", "text/plain");
  }).listen(PORT, () => {
    console.log(`Сайт: http://localhost:${PORT}`);
    if (!BOT_TOKEN || !CHAT_IDS.length) console.log("ВНИМАНИЕ: Telegram не настроен — заполните .env (см. .env.example)");
  });
}
