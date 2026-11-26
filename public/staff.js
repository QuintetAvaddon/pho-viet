/* Раздел для персонала Phở Việt: заказы, статусы, отчёты, сотрудники.
   Данные — /api/staff/… (server.js + staff.js на сервере). Новые заказы приходят сразу (Server-Sent Events):
   звук, отметка в списке и, если разрешено, системное уведомление. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rub = n => Math.round(Number(n) || 0).toLocaleString("ru-RU") + " ₽";
  const num = n => Math.round(Number(n) || 0).toLocaleString("ru-RU");

  /* ---------- время по Москве ---------- */
  const MSK = 3 * 3600e3;
  const mskIso = iso => new Date(new Date(iso).getTime() + MSK).toISOString();
  const hhmm = iso => mskIso(iso).slice(11, 16);
  const dayOf = iso => mskIso(iso).slice(0, 10);
  const dm = day => day.slice(8, 10) + "." + day.slice(5, 7);
  const dmy = day => day.split("-").reverse().join(".");
  const addDays = (day, n) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  const WEEK = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const weekday = day => WEEK[new Date(day + "T12:00:00Z").getUTCDay()];

  const ACTION = {
    accepted: ["Принять", "ok"], cooking: ["Начать готовить", "ok"], delivering: ["Передать курьеру", "ok"],
    ready: ["Готов к выдаче", "ok"], done: ["Заказ выполнен", "ok"], cancelled: ["Отменить заказ", "danger"]
  };
  const REASONS = ["Гость отказался", "Не дозвонились", "Нет блюд в наличии", "Не успеваем ко времени", "Повторный заказ"];

  const S = {
    me: null, points: [], labels: {}, today: "",
    view: "orders", scope: "active", date: "", point: "", q: "",
    orders: [], openId: null, open: null, next: [],
    fresh: new Set(), seenMax: 0,
    period: "today", from: "", to: "", report: null, daysAsTable: false,
    users: []
  };

  /* ---------- запросы ---------- */
  async function api(path, { method = "GET", body, allow401 = false } = {}) {
    const r = await fetch("/api/staff/" + path, {
      method, credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-PV-Staff": "1" },
      body: body ? JSON.stringify(body) : undefined
    });
    let j = {};
    try { j = await r.json(); } catch {}
    if (r.status === 401 && !allow401) { showLogin("Сессия закончилась — войдите снова"); }
    if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || `Ошибка ${r.status}`), { status: r.status, data: j });
    return j;
  }
  let toastT = 0;
  function toast(text, err) {
    const t = $("#toast");
    t.textContent = text; t.classList.toggle("err", !!err); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3200);
  }

  /* ---------- экраны ---------- */
  function only(id) {
    for (const x of ["boot", "notice", "login", "app"]) $("#" + x).hidden = x !== id;
  }
  function showNotice(title, text) { $("#noticeTitle").textContent = title; $("#noticeText").textContent = text; only("notice"); }
  function showLogin(msg) {
    stopStream();
    only("login");
    $("#loginError").textContent = msg || "";
    setTimeout(() => $("#loginForm [name=login]").focus(), 50);
  }

  async function boot() {
    try {
      start(await api("me", { allow401: true }));
    } catch (e) {
      if (e.data && e.data.code === "disabled") {
        showNotice("Раздел заказов скоро заработает", "Он включится после переезда сайта на сервер с базой заказов. Пока заказы приходят в Telegram.");
      } else if (e.status === 401) showLogin();
      else showNotice("Нет связи с сервером", "Проверьте интернет и обновите страницу.");
    }
  }

  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.currentTarget, btn = f.querySelector("button[type=submit]");
    const login = f.login.value.trim(), password = f.password.value;
    if (!login || !password) { $("#loginError").textContent = "Введите логин и пароль"; return; }
    btn.disabled = true; $("#loginError").textContent = "";
    try {
      await api("login", { method: "POST", body: { login, password }, allow401: true });
      f.password.value = "";
      start(await api("me"));
    } catch (err) {
      $("#loginError").textContent = err.message;
    } finally { btn.disabled = false; }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    try { await api("logout", { method: "POST", allow401: true }); } catch {}
    showLogin("Вы вышли");
  });

  function start(me) {
    S.me = me.user; S.points = me.points || []; S.labels = me.labels || {}; S.today = me.today; S.date = S.today;
    const owner = S.me.role === "owner";
    const pt = S.points.find(p => p.id === S.me.point);
    $("#whoName").innerHTML = `<b>${esc(S.me.name)}</b>${owner ? "владелец" : esc(pt ? pt.name : "менеджер")}`;
    $("#teamTab").hidden = !owner;
    for (const sel of ["#pointOrders", "#pointReports"]) {
      const el = $(sel);
      el.hidden = !owner;
      el.innerHTML = `<option value="">Все рестораны</option>` + S.points.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
      el.value = S.point;
    }
    $("#addPoint").innerHTML = S.points.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    $("#dateInput").value = S.date; $("#dateInput").max = S.today;
    only("app");
    setView(location.hash === "#reports" ? "reports" : location.hash === "#team" && owner ? "team" : "orders");
    loadOrders().then(() => {
      const m = /^#(\d{1,9})$/.exec(location.hash);
      if (m) openOrder(Number(m[1]));
    });
    startStream();
    updateNotifyBtn();
  }

  /* ---------- разделы ---------- */
  function setView(v) {
    S.view = v;
    $$(".tab").forEach(t => t.classList.toggle("is-on", t.dataset.view === v));
    $("#viewOrders").hidden = v !== "orders";
    $("#viewReports").hidden = v !== "reports";
    $("#viewTeam").hidden = v !== "team";
    if (v === "reports") { if (!S.from) setPeriod(S.period); else loadReport(); }
    if (v === "team") loadUsers();
    if (v !== "orders" && /^#\d+$/.test(location.hash)) history.replaceState(null, "", "/staff");
  }
  $$(".tab").forEach(t => t.addEventListener("click", () => setView(t.dataset.view)));

  /* ---------- заказы ---------- */
  let loadSeq = 0;
  async function loadOrders() {
    const my = ++loadSeq;
    const p = new URLSearchParams({ scope: S.scope });
    if (S.scope !== "active") p.set("date", S.date);
    if (S.point) p.set("point", S.point);
    if (S.q) p.set("q", S.q);
    try {
      const { orders, newCount } = await api("orders?" + p);
      if (my !== loadSeq) return;
      S.orders = orders;
      setBadge(newCount);
      renderOrders();
    } catch (e) { if (e.status !== 401) toast(e.message, true); }
  }
  function setBadge(n) {
    const b = $("#newBadge");
    b.hidden = !n; b.textContent = n;
    document.title = (n ? `(${n}) ` : "") + "Заказы — Phở Việt";
  }

  const pill = st => `<span class="pill st-${esc(st)}">${esc(S.labels[st] || st)}</span>`;
  // К какому времени: «как можно скорее» или «к 19:30»; если до времени меньше 30 минут — подсвечиваем
  function whenText(o) {
    if (o.time === "asap") return { text: "Как можно скорее", soon: o.status === "new" };
    const [h, m] = o.time.split(":").map(Number);
    const now = new Date(Date.now() + MSK);
    const left = h * 60 + m - (now.getUTCHours() * 60 + now.getUTCMinutes());
    return { text: "к " + o.time, soon: dayOf(o.createdAt) === S.today && left >= -10 && left <= 30 && !["done", "cancelled"].includes(o.status) };
  }

  function renderOrders() {
    const list = $("#orderList");
    const showPoint = S.me.role === "owner" && !S.point;
    if (!S.orders.length) {
      const txt = S.q ? "Ничего не нашлось" : S.scope === "active" ? "Активных заказов нет — новые появятся здесь сами" : `За ${dmy(S.date)} заказов нет`;
      list.innerHTML = `<p class="empty">${txt}</p>`;
      return;
    }
    const sum = S.orders.reduce((s, o) => s + (o.status === "cancelled" ? 0 : o.total), 0);
    list.innerHTML = S.orders.map(o => {
      const w = whenText(o);
      const items = (o.items || []).reduce((s, i) => s + i.qty, 0);
      const day = dayOf(o.createdAt);
      return `<button class="order-card${S.fresh.has(o.id) ? " is-fresh" : ""}${S.openId === o.id ? " is-open" : ""}" data-id="${o.id}" type="button">
        <span class="oc-row"><b class="oc-num">№${o.id}</b><span class="oc-time">${hhmm(o.createdAt)}${day !== S.today ? " · " + dm(day) : ""}</span>${pill(o.status)}</span>
        <span class="oc-meta"><span><svg class="ic"><use href="#${o.method === "pickup" ? "i-walk" : "i-truck"}"/></svg>${o.method === "pickup" ? "Самовывоз" : "Доставка"}</span>${showPoint ? `<span>${esc(o.pointName || "")}</span>` : ""}<span class="oc-when${w.soon ? " soon" : ""}">${esc(w.text)}</span></span>
        <span class="oc-meta"><span class="oc-guest">${esc(o.name)}</span><span>${items} ${plural(items, "позиция", "позиции", "позиций")}</span><b class="oc-total">${rub(o.total)}</b></span>
      </button>`;
    }).join("") + `<p class="list-note">${S.orders.length} ${plural(S.orders.length, "заказ", "заказа", "заказов")} на ${rub(sum)}${S.scope !== "active" ? "" : " · отменённые не считаются"}</p>`;
  }

  $("#orderList").addEventListener("click", e => {
    const card = e.target.closest(".order-card");
    if (card) openOrder(Number(card.dataset.id));
  });
  $$(".seg-btn").forEach(b => b.addEventListener("click", () => {
    S.scope = b.dataset.scope;
    $$(".seg-btn").forEach(x => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-selected", x === b); });
    $("#datePick").hidden = S.scope === "active";
    loadOrders();
  }));
  $("#dateInput").addEventListener("change", e => { S.date = e.target.value || S.today; loadOrders(); });
  $("#pointOrders").addEventListener("change", e => { S.point = e.target.value; $("#pointReports").value = S.point; loadOrders(); });
  let qT = 0;
  $("#searchInput").addEventListener("input", e => { clearTimeout(qT); qT = setTimeout(() => { S.q = e.target.value.trim(); loadOrders(); }, 300); });

  /* ---------- карточка заказа ---------- */
  async function openOrder(id) {
    try {
      const { order, next } = await api("orders/" + id);
      S.openId = id; S.open = order; S.next = next;
      S.fresh.delete(id);
      renderPanel();
      renderOrders();
      if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    } catch (e) { if (e.status !== 401) toast(e.message, true); }
  }
  function closeOrder() {
    S.openId = null; S.open = null;
    $("#orderPanel").hidden = true;
    renderOrders();
    history.replaceState(null, "", "/staff");
  }

  function renderPanel() {
    const o = S.open, el = $("#orderPanel");
    if (!o) { el.hidden = true; return; }
    const a = o.address;
    const addr = a ? [a.street, a.flat && `кв. ${a.flat}`, a.entrance && `подъезд ${a.entrance}`, a.floor && `этаж ${a.floor}`].filter(Boolean).join(", ") : "";
    const maps = a ? `https://yandex.ru/maps/?text=${encodeURIComponent("Москва, " + a.street)}` : "";
    const w = whenText(o);
    const created = `${dmy(dayOf(o.createdAt))}, ${hhmm(o.createdAt)}`;
    const acts = S.next.map(st => {
      const [label, kind] = st === "accepted" && ["done", "cancelled"].includes(o.status) ? ["Вернуть в работу", "ghost"] : (ACTION[st] || [S.labels[st], "ghost"]);
      return `<button class="btn ${kind}" data-status="${esc(st)}" type="button">${esc(label)}</button>`;
    }).join("");
    el.innerHTML = `
      <div class="op-head">
        <button class="icon-btn op-back" type="button" data-close aria-label="К списку"><svg class="ic"><use href="#i-left"/></svg></button>
        <h2><span class="op-word">Заказ </span>№${o.id}</h2>${pill(o.status)}
        <button class="icon-btn" type="button" data-close aria-label="Закрыть"><svg class="ic"><use href="#i-close"/></svg></button>
      </div>
      <div class="op-body">
        ${acts ? `<div class="op-actions">${acts}</div>` : ""}
        ${o.status === "cancelled" && o.cancelReason ? `<p class="comment">Причина отмены: ${esc(o.cancelReason)}</p>` : ""}
        <div class="block">
          <div class="guest-row">
            <span class="guest-name">${esc(o.name)}</span>
            <a class="btn ghost sm" href="tel:${esc(o.phone)}"><svg class="ic"><use href="#i-phone"/></svg>${esc(o.phone)}</a>
          </div>
          <dl class="kv" style="margin-top:12px">
            <dt>Получение</dt><dd>${o.method === "pickup" ? "Самовывоз" : "Доставка"}${o.pointName ? ` · ${esc(o.pointName)}` : ""}</dd>
            ${addr ? `<dt>Адрес</dt><dd>${esc(addr)} <a class="link-btn" href="${maps}" target="_blank" rel="noopener">Маршрут</a></dd>` : ""}
            <dt>Время</dt><dd${w.soon ? ' style="color:var(--st-new)"' : ""}>${esc(w.text)}</dd>
            <dt>Оплата</dt><dd>${o.payment === "cash" ? "Наличными" + (o.change ? ` · сдача с ${esc(o.change)}` : "") : "Картой при получении"}</dd>
            <dt>Принят</dt><dd>${created}</dd>
          </dl>
          ${o.comment ? `<p class="comment" style="margin-top:12px">💬 ${esc(o.comment)}</p>` : ""}
        </div>
        <div class="block">
          <h3>Состав</h3>
          <ul class="items">${(o.items || []).map(i => `<li><span class="q">${i.qty}×</span><span>${esc(i.name)}</span><span class="s">${rub(i.price * i.qty)}</span></li>`).join("")}</ul>
          <div class="sums">
            <div><span>Блюда</span><span>${rub(o.subtotal)}</span></div>
            ${o.discount ? `<div><span>Промокод ${esc(o.coupon)}</span><span>−${rub(o.discount)}</span></div>` : ""}
            ${o.method === "delivery" ? `<div><span>Доставка</span><span>${o.delivery ? rub(o.delivery) : "бесплатно"}</span></div>` : ""}
            <div class="total"><span>Итого</span><span>${rub(o.total)}</span></div>
          </div>
        </div>
        <div class="block">
          <h3>История</h3>
          <ul class="events">${(o.events || []).map(ev => `<li><time>${hhmm(ev.at)}</time><span>${esc(S.labels[ev.status] || ev.status)}<small>${esc(ev.who || (ev.status === "new" ? "Гость оформил заказ" : ""))}${ev.note ? " · " + esc(ev.note) : ""}${dayOf(ev.at) !== dayOf(o.createdAt) ? " · " + dm(dayOf(ev.at)) : ""}</small></span></li>`).join("")}</ul>
        </div>
      </div>`;
    el.hidden = false;
  }

  $("#orderPanel").addEventListener("click", e => {
    if (e.target.closest("[data-close]")) return closeOrder();
    const b = e.target.closest("[data-status]");
    if (!b) return;
    if (b.dataset.status === "cancelled") return askCancel();
    changeStatus(b.dataset.status, "", b);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && S.openId && !$("dialog[open]")) closeOrder(); });

  async function changeStatus(status, reason, btn) {
    const o = S.open; if (!o) return;
    if (btn) btn.disabled = true;
    try {
      const { order, next } = await api(`orders/${o.id}/status`, { method: "POST", body: { status, reason } });
      S.open = order; S.next = next;
      renderPanel();
      toast(`№${o.id}: ${S.labels[status]}`);
      loadOrders();
    } catch (e) {
      if (e.status === 409 && e.data && e.data.order) { S.open = e.data.order; renderPanel(); }
      if (e.status !== 401) toast(e.message, true);
    } finally { if (btn) btn.disabled = false; }
  }

  // Отмена — с причиной (быстрый выбор или своя)
  function askCancel() {
    const d = $("#cancelDialog");
    $("#cancelNum").textContent = "№" + S.open.id;
    $("#cancelReason").value = ""; $("#cancelError").textContent = "";
    $("#reasons").innerHTML = REASONS.map(r => `<button class="chip" type="button" data-reason="${esc(r)}">${esc(r)}</button>`).join("");
    d.showModal();
  }
  $("#reasons").addEventListener("click", e => {
    const c = e.target.closest("[data-reason]"); if (!c) return;
    $$("#reasons .chip").forEach(x => x.classList.toggle("is-on", x === c));
    $("#cancelReason").value = c.dataset.reason;
  });
  $("#cancelDialog").addEventListener("close", () => {
    const d = $("#cancelDialog");
    if (d.returnValue !== "ok") return;
    const reason = $("#cancelReason").value.trim();
    if (reason.length < 2) { d.returnValue = ""; d.showModal(); $("#cancelError").textContent = "Укажите причину отмены"; return; }
    changeStatus("cancelled", reason);
  });

  /* ---------- живые обновления, звук, уведомления ---------- */
  let es = null, esFails = 0, pollT = 0, reloadT = 0;
  function startStream() {
    stopStream();
    es = new EventSource("/api/staff/stream");
    es.addEventListener("open", () => { esFails = 0; });
    es.addEventListener("order", e => {
      let evt; try { evt = JSON.parse(e.data); } catch { return; }
      if (evt.type === "new") { S.fresh.add(evt.id); ding(); notify(evt.id); }
      clearTimeout(reloadT); reloadT = setTimeout(loadOrders, 250);
      if (S.openId === evt.id && evt.type === "status") openOrder(evt.id);
      if (S.view === "reports") { clearTimeout(repT); repT = setTimeout(loadReport, 1500); }
    });
    es.addEventListener("error", () => {
      // браузер переподключается сам; если ошибки подряд — проверим, не закончилась ли сессия
      if (++esFails === 3) api("me").catch(() => {});
    });
    // запасной вариант, если живые обновления где-то режутся: раз в минуту обновляем список
    pollT = setInterval(() => { if (!document.hidden && S.view === "orders") loadOrders(); }, 60000);
  }
  function stopStream() { if (es) { es.close(); es = null; } clearInterval(pollT); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.me && S.view === "orders") loadOrders(); });

  // «Дин-дон» без звукового файла; браузер разрешает звук после первого касания страницы
  let audio = null;
  const unlock = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch {} };
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));
  function ding() {
    if (!audio) return;
    const t = audio.currentTime;
    [[880, 0], [660, 0.22]].forEach(([f, d]) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.6);
      o.connect(g).connect(audio.destination); o.start(t + d); o.stop(t + d + 0.65);
    });
    if (navigator.vibrate) try { navigator.vibrate([120, 80, 120]); } catch {}
  }

  const canNotify = "Notification" in window;
  function updateNotifyBtn() {
    const b = $("#notifyBtn");
    b.hidden = !canNotify;
    b.setAttribute("aria-pressed", canNotify && Notification.permission === "granted" && localStorage.getItem("pvNotify") !== "off");
  }
  $("#notifyBtn").addEventListener("click", async () => {
    if (!canNotify) return;
    if (Notification.permission === "granted") {
      localStorage.setItem("pvNotify", localStorage.getItem("pvNotify") === "off" ? "on" : "off");
    } else {
      const r = await Notification.requestPermission();
      if (r !== "granted") toast("Уведомления запрещены в настройках браузера", true);
      localStorage.setItem("pvNotify", "on");
    }
    updateNotifyBtn();
    toast($("#notifyBtn").getAttribute("aria-pressed") === "true" ? "Уведомления включены" : "Уведомления выключены");
  });
  async function notify(id) {
    if (!canNotify || Notification.permission !== "granted" || localStorage.getItem("pvNotify") === "off" || !document.hidden) return;
    const opts = { body: "Откройте, чтобы принять", tag: "order-" + id, data: { url: "/staff#" + id }, icon: "/icons/icon-192.png", badge: "/icons/favicon-48.png" };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(`Новый заказ №${id}`, opts);
      else new Notification(`Новый заказ №${id}`, opts);
    } catch {}
  }

  // Не гасить экран — для планшета на кассе
  let wake = null;
  async function setWake(on) {
    try {
      if (on && "wakeLock" in navigator) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { if (!document.hidden) updateWakeBtn(); }); }
      else if (wake) { await wake.release(); wake = null; }
    } catch { wake = null; toast("Браузер не разрешил держать экран включённым", true); }
    updateWakeBtn();
  }
  const updateWakeBtn = () => $("#wakeBtn").setAttribute("aria-pressed", !!(wake && !wake.released));
  $("#wakeBtn").hidden = !("wakeLock" in navigator);
  $("#wakeBtn").addEventListener("click", () => { const on = !(wake && !wake.released); localStorage.setItem("pvWake", on ? "on" : "off"); setWake(on); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && localStorage.getItem("pvWake") === "on" && !(wake && !wake.released)) setWake(true); });

  /* ---------- отчёты ---------- */
  let repT = 0, repSeq = 0;
  function setPeriod(p) {
    const t = S.today;
    const month = t.slice(0, 8) + "01";
    const prevEnd = addDays(month, -1);
    const map = { today: [t, t], yesterday: [addDays(t, -1), addDays(t, -1)], 7: [addDays(t, -6), t], 30: [addDays(t, -29), t], month: [month, t], prevmonth: [prevEnd.slice(0, 8) + "01", prevEnd] };
    [S.from, S.to] = map[p] || map.today;
    S.period = p;
    $$("#periodChips .chip").forEach(c => c.classList.toggle("is-on", c.dataset.period === p));
    $("#fromInput").value = S.from; $("#toInput").value = S.to;
    loadReport();
  }
  $$("#periodChips .chip").forEach(c => c.addEventListener("click", () => setPeriod(c.dataset.period)));
  for (const id of ["#fromInput", "#toInput"]) $(id).addEventListener("change", () => {
    let f = $("#fromInput").value, t = $("#toInput").value;
    if (!f || !t) return;
    if (t < f) [f, t] = [t, f];
    S.from = f; S.to = t; S.period = "custom";
    $$("#periodChips .chip").forEach(c => c.classList.remove("is-on"));
    loadReport();
  });
  $("#pointReports").addEventListener("change", e => { S.point = e.target.value; $("#pointOrders").value = S.point; loadReport(); });

  async function loadReport() {
    const my = ++repSeq;
    const p = new URLSearchParams({ from: S.from, to: S.to });
    if (S.point) p.set("point", S.point);
    $("#exportBtn").href = "/api/staff/export.csv?" + p;
    $("#report").classList.add("is-loading"); // прежний отчёт остаётся на месте, пока грузится новый
    try {
      const { report } = await api("report?" + p);
      if (my !== repSeq) return;
      S.report = report;
      renderReport();
    } catch (e) { if (e.status !== 401) toast(e.message, true); }
    finally { if (my === repSeq) $("#report").classList.remove("is-loading"); }
  }

  const period = r => r.from === r.to ? `${dmy(r.from)} (${weekday(r.from)})` : `${dmy(r.from)} — ${dmy(r.to)}`;
  const share = (a, b) => b ? Math.round(a / b * 100) : 0;
  function table(head, rows, empty) {
    if (!rows.length) return `<p class="tbl-empty">${esc(empty)}</p>`;
    return `<table class="tbl"><thead><tr>${head.map((h, i) => `<th${i ? ' class="n"' : ""}>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function renderReport() {
    const r = S.report, t = r.totals;
    const pointName = r.point ? (S.points.find(p => p.id === r.point) || {}).name : "Все рестораны";
    const single = r.from === r.to;
    const METHOD = { delivery: "Доставка", pickup: "Самовывоз" }, PAY = { card: "Картой при получении", cash: "Наличными" };
    $("#report").innerHTML = `
      <div class="stats">
        <div class="stat hero"><p class="stat-label">Выручка · ${esc(pointName)}</p><p class="stat-value">${rub(t.revenue)}</p>
          <p class="stat-sub">${period(r)} · ${t.done} ${plural(t.done, "выполненный заказ", "выполненных заказа", "выполненных заказов")}</p></div>
        <div class="stat"><p class="stat-label">Средний чек</p><p class="stat-value">${rub(t.avg)}</p></div>
        <div class="stat"><p class="stat-label">Заказов</p><p class="stat-value">${num(t.orders)}</p><p class="stat-sub">${t.active ? `в работе ${t.active} · ${rub(t.activeSum)}` : "все закрыты"}</p></div>
        <div class="stat"><p class="stat-label">Отменено</p><p class="stat-value">${num(t.cancelled)}</p><p class="stat-sub">${share(t.cancelled, t.orders)}% заказов · ${rub(t.cancelledSum)}</p></div>
        <div class="stat"><p class="stat-label">Скидки по промокодам</p><p class="stat-value">${rub(t.discount)}</p><p class="stat-sub">доставка оплачена: ${rub(t.deliveryFees)}</p></div>
      </div>
      <div class="card">
        <div class="card-head"><div><h2>${single ? "Выручка по часам" : "Выручка по дням"}</h2><p>Выполненные заказы · ${period(r)}</p></div>
          <button class="link-btn" type="button" id="tableToggle">${S.daysAsTable ? "Графиком" : "Таблицей"}</button></div>
        <div id="dayChart"></div>
      </div>
      <div class="tables">
        ${!r.point ? `<div class="card wide"><h2>По ресторанам</h2>${table(["Ресторан", "Заказов", "Выполнено", "Отменено", "Выручка", "Средний чек"],
          r.points.map(x => [esc(x.name), num(x.orders), num(x.done), num(x.cancelled), rub(x.revenue), rub(x.avg)]), "Заказов нет")}</div>` : ""}
        <div class="card"><h2>Популярные блюда</h2>${table(["Блюдо", "Порций", "Сумма"], r.dishes.map(d => [esc(d.name), num(d.qty), rub(d.revenue)]), "Выполненных заказов нет")}</div>
        <div class="card"><h2>Доставка и самовывоз</h2>${table(["Способ", "Заказов", "Выполнено", "Выручка"],
          r.methods.map(m => [METHOD[m.id] || esc(m.id), num(m.orders), num(m.done), rub(m.revenue)]), "Заказов нет")}
          <h2 style="margin-top:16px">Оплата</h2>${table(["Способ", "Заказов", "Сумма"], r.payments.map(p => [PAY[p.id] || esc(p.id), num(p.done), rub(p.revenue)]), "Выполненных заказов нет")}</div>
        <div class="card"><h2>Причины отмен</h2>${table(["Причина", "Раз", "Сумма"], r.reasons.map(x => [esc(x.reason), num(x.count), rub(x.sum)]), "Отмен не было")}
          <h2 style="margin-top:16px">Промокоды</h2>${table(["Код", "Раз", "Скидка"], r.coupons.map(c => [esc(c.code), num(c.uses), rub(c.discount)]), "Промокоды не применяли")}</div>
      </div>`;
    $("#tableToggle").addEventListener("click", () => { S.daysAsTable = !S.daysAsTable; renderReport(); });
    const series = single ? hoursSeries(r.hours) : r.days.map(d => ({ key: d.date, label: dm(d.date), title: `${dmy(d.date)}, ${weekday(d.date)}`, value: d.revenue, orders: d.orders, done: d.done, cancelled: d.cancelled }));
    const box = $("#dayChart");
    if (S.daysAsTable) box.innerHTML = table([single ? "Час" : "День", "Заказов", "Выполнено", "Отменено", "Выручка"],
      series.map(s => [esc(s.title), num(s.orders), num(s.done ?? s.orders), num(s.cancelled ?? 0), rub(s.value)]), "Нет данных");
    else barChart(box, series, `${single ? "Выручка по часам" : "Выручка по дням"}, ${period(r)}`);
  }
  // Часы работы: показываем с 9 до 23 и шире, если заказы были раньше или позже
  function hoursSeries(hours) {
    const used = hours.filter(h => h.orders).map(h => h.hour);
    const from = Math.min(9, ...used), to = Math.max(23, ...used);
    return hours.slice(from, to + 1).map(h => ({ key: h.hour, label: String(h.hour).padStart(2, "0"), title: `${String(h.hour).padStart(2, "0")}:00–${String(h.hour + 1).padStart(2, "0")}:00`, value: h.revenue, orders: h.orders }));
  }

  // Ровные деления оси: 1, 2, 2.5, 5 × 10ⁿ
  function niceStep(raw) {
    if (raw <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }
  const tick = v => v >= 1e6 ? (v / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " млн" : v >= 1e4 ? (v / 1e3).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " тыс." : num(v);

  /* Столбики выручки: один ряд — один цвет, без легенды (заголовок называет ряд). Столбик ≤ 24 px, скругление 4 px
     сверху, прямой угол у основания, зазор между столбиками; подсказка по наведению и с клавиатуры, таблица — рядом. */
  function barChart(box, data, aria) {
    const W = Math.max(280, box.clientWidth || 600), H = 230, L = 58, R = 8, T = 10, B = 26;
    const max = Math.max(0, ...data.map(d => d.value));
    const step = niceStep(max / 4 || 1), top = step * Math.max(1, Math.ceil(max / step));
    const iw = W - L - R, ih = H - T - B, band = iw / data.length;
    const bw = Math.max(2, Math.min(24, band - 2));
    const y = v => T + ih - (v / top) * ih;
    const every = Math.ceil(data.length / Math.max(1, Math.floor(iw / 44)));
    let g = `<g class="grid">`, ax = `<g class="axis">`;
    for (let v = 0; v <= top + 1e-9; v += step) {
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
      ax += `<text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(tick(v))}</text>`;
    }
    g += `</g>`;
    let bars = "";
    data.forEach((d, i) => {
      const x = L + i * band + (band - bw) / 2, yy = y(d.value), h = T + ih - yy, r = Math.min(4, bw / 2, h);
      const shape = h <= 0 ? "" : h < 1.5 ? `<rect class="bar" x="${x.toFixed(1)}" y="${(T + ih - 1.5).toFixed(1)}" width="${bw.toFixed(1)}" height="1.5"/>`
        : `<path class="bar" d="M${x.toFixed(1)},${(T + ih).toFixed(1)}V${(yy + r).toFixed(1)}Q${x.toFixed(1)},${yy.toFixed(1)} ${(x + r).toFixed(1)},${yy.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)},${yy.toFixed(1)} ${(x + bw).toFixed(1)},${(yy + r).toFixed(1)}V${(T + ih).toFixed(1)}Z"/>`;
      bars += `<rect class="hit" x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${ih + B}" tabindex="0" data-i="${i}" aria-label="${esc(d.title)}: ${esc(rub(d.value))}, заказов ${d.orders}"/>${shape || '<g class="bar"></g>'}`;
      if (i % every === 0) ax += `<text x="${(L + i * band + band / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
    });
    ax += `</g>`;
    box.innerHTML = `<div class="chart" role="group" aria-label="${esc(aria)}"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${bars}${ax}</svg><div class="tip" hidden></div></div>`;
    const tip = $(".tip", box), chart = $(".chart", box), svg = $("svg", box);
    const show = el => {
      const d = data[Number(el.dataset.i)];
      tip.replaceChildren();
      const strong = document.createElement("strong"); strong.textContent = rub(d.value);
      const l1 = document.createElement("div"); l1.textContent = d.title;
      const l2 = document.createElement("div"); l2.textContent = `заказов: ${d.orders}${d.cancelled ? ` · отменено: ${d.cancelled}` : ""}`;
      tip.append(strong, l1, l2);
      const rb = el.getBoundingClientRect(), cb = chart.getBoundingClientRect(), sb = svg.getBoundingClientRect();
      const barTop = sb.top + (y(d.value) / H) * sb.height;
      tip.style.left = Math.min(Math.max(rb.left - cb.left + rb.width / 2, 80), cb.width - 80) + "px";
      tip.style.top = (barTop - cb.top) + "px";
      tip.hidden = false;
    };
    const hide = () => { tip.hidden = true; };
    $$(".hit", box).forEach(h => {
      h.addEventListener("pointerenter", () => show(h));
      h.addEventListener("pointerleave", hide);
      h.addEventListener("focus", () => show(h));
      h.addEventListener("blur", hide);
      h.addEventListener("click", () => show(h));
    });
  }
  let rT = 0;
  addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (S.view === "reports" && S.report && !S.daysAsTable) renderReport(); }, 200); });

  /* ---------- сотрудники (владелец) ---------- */
  async function loadUsers() {
    try { S.users = (await api("users")).users; renderUsers(); } catch (e) { if (e.status !== 401) toast(e.message, true); }
  }
  function renderUsers() {
    const ptName = id => (S.points.find(p => p.id === id) || {}).name || id;
    $("#teamList").innerHTML = S.users.map(u => `
      <div class="member${u.active ? "" : " off"}">
        <div class="member-info"><b>${esc(u.name)}</b><span>${esc(u.login)} · ${u.role === "owner" ? "владелец" : esc(ptName(u.point))}${u.active ? "" : " · отключён"}</span></div>
        <button class="btn ghost sm" type="button" data-pass="${u.id}">Новый пароль</button>
        ${u.id === S.me.id ? "" : `<button class="btn ${u.active ? "danger" : "ghost"} sm" type="button" data-active="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? "Отключить" : "Включить"}</button>`}
      </div>`).join("");
  }
  $("#teamList").addEventListener("click", async e => {
    const pass = e.target.closest("[data-pass]"), act = e.target.closest("[data-active]");
    try {
      if (pass) {
        const u = S.users.find(x => x.id === Number(pass.dataset.pass));
        if (!confirm(`Выдать новый пароль для ${u.name}? Старый перестанет работать.`)) return;
        const { password } = await api("users/" + u.id, { method: "POST", body: { resetPassword: true } });
        showPassword(`Новый пароль для ${u.name}`, `Логин: ${u.login}. Старые входы закрыты.`, password);
        if (u.id === S.me.id) showLogin("Пароль изменён — войдите с новым");
      }
      if (act) {
        const on = act.dataset.on === "1";
        await api("users/" + act.dataset.active, { method: "POST", body: { active: on } });
        toast(on ? "Сотрудник включён" : "Сотрудник отключён — его входы закрыты");
        loadUsers();
      }
    } catch (err) { if (err.status !== 401) toast(err.message, true); }
  });
  const syncRole = () => { $("#addPointField").hidden = $("#addForm").role.value !== "manager"; };
  $("#addForm").role.addEventListener("change", syncRole);
  syncRole();
  $("#addForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.currentTarget;
    $("#addError").textContent = "";
    try {
      const { user, password } = await api("users", { method: "POST", body: { name: f.name.value, login: f.login.value, role: f.role.value, point: f.point.value } });
      f.reset(); syncRole();
      showPassword(`Сотрудник ${user.name} добавлен`, `Логин: ${user.login}. Адрес для входа: ${location.origin}/staff.`, password);
      loadUsers();
    } catch (err) { $("#addError").textContent = err.message; }
  });
  function showPassword(title, text, password) {
    $("#passTitle").textContent = title; $("#passText").textContent = text + " Пароль показывается один раз.";
    $("#passValue").textContent = password;
    $("#passDialog").showModal();
  }
  $("#passCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#passValue").textContent); toast("Пароль скопирован"); } catch { toast("Не удалось скопировать — перепишите вручную", true); }
  });

  // service worker нужен для уведомлений и установки раздела на телефон
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  boot();
})();
