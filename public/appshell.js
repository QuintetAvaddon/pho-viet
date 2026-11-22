/* Оболочка мобильного приложения: заставка, нижняя панель вкладок, выбор ресторана,
   акции и купоны (страница /promo), главная приложения (/app).
   Подключается на /app, /menu и /promo после menu.js и hours.js. */
(() => {
  "use strict";
  const CFG = window.SITE_CONFIG || {};
  const H = window.PV_HOURS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rub = n => Number(n).toLocaleString("ru-RU") + " ₽";
  const root = document.documentElement;
  const page = document.body.dataset.page || "";
  const demo = /(^|[?&])demo=1(&|$)/.test(location.search);
  const LOCS = Array.isArray(CFG.locations) ? CFG.locations : [];
  const CUTOFF = CFG.orderCutoffMin ?? 30;
  const POINT_KEY = "phoviet_point";
  const CART_KEY = "phoviet_cart_v1";
  const tel = (CFG.phone || "").replace(/[^\d+]/g, "");

  /* ---------- Заставка с логотипом: при запуске приложения и при перезагрузке страницы ---------- */
  // Показывать ли — решает маленький скрипт сразу после разметки заставки; здесь только плавно убираем
  const splash = $("#splash");
  if (splash) {
    let gone = false;
    // время считаем с момента, когда заставка появилась на экране (а не с начала загрузки страницы)
    const t0 = window.__splashT0 ?? performance.now();
    const hide = () => {
      if (gone) return; gone = true;
      setTimeout(() => {
        splash.classList.add("done");
        setTimeout(() => splash.remove(), 700);
      }, Math.max(0, t0 + 2300 - performance.now())); // анимация логотипа успевает пройти целиком
    };
    if (document.readyState === "complete") hide(); else addEventListener("load", hide, { once: true });
    setTimeout(hide, Math.max(0, t0 + 4200 - performance.now())); // медленная сеть — не держим заставку дольше
  }

  /* ---------- Часы работы и выбор ресторана ---------- */
  const locById = id => LOCS.find(l => l.id === id);
  const fmt = m => H ? H.fmt(m) : "";
  function status(l) {
    const h = H && H.parseHours(l && l.hours);
    if (!h) return { open: true, text: "" };
    const now = H.mskNow();
    const open = [now, now + 1440].some(t => t >= h.from && t < h.to);
    const w = H.orderWindow(l, CUTOFF);
    const orders = H.acceptsNow(l, CUTOFF);
    return {
      open, orders,
      text: open ? `Открыто до ${fmt(h.to)}` : `Откроется в ${fmt(h.from)}`,
      ordersText: w ? `заказы ${orders ? "до " + fmt(w.last) : "с " + fmt(w.from)}` : ""
    };
  }
  const getPoint = () => locById(localStorage.getItem(POINT_KEY)) || null;
  const setPoint = id => { localStorage.setItem(POINT_KEY, id); document.dispatchEvent(new CustomEvent("point:change", { detail: id })); };
  const mapUrl = l => "https://yandex.ru/maps/?text=" + encodeURIComponent("Москва, " + (l.address || ""));

  // Верх меню на телефоне: выбранный ресторан, его адрес и статус — как в приложении
  function renderPointButton() {
    const btn = $("#pointBtn"); if (!btn) return;
    const l = getPoint();
    $("#pointName").textContent = l ? l.name : "Выберите ресторан";
    $("#pointAddr").textContent = l ? l.address : `${LOCS.length} ресторанов в Москве`;
    const st = l ? status(l) : null, s = $("#pointStatus");
    s.textContent = st ? `${st.text}${st.ordersText ? " · " + st.ordersText : ""}` : "для самовывоза и доставки";
    s.classList.toggle("closed", !!st && !st.orders);
  }
  document.addEventListener("point:change", renderPointButton);

  /* ---------- Нижний лист (выбор ресторана, подробности акции) ---------- */
  let sheetEl = null, lastFocus = null;
  function openSheet(html, label) {
    closeSheet();
    lastFocus = document.activeElement;
    sheetEl = document.createElement("div");
    sheetEl.className = "sheet-overlay";
    sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <span class="sheet-grip" aria-hidden="true"></span>
      <button class="sheet-close" data-sheet-close aria-label="Закрыть"><svg class="ic" aria-hidden="true"><use href="#i-close"/></svg></button>
      ${html}</div>`;
    document.body.append(sheetEl);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => sheetEl && sheetEl.classList.add("open"));
    sheetEl.addEventListener("click", e => { if (e.target === sheetEl || e.target.closest("[data-sheet-close]")) closeSheet(); });
    $("button, a", $(".sheet", sheetEl))?.focus();
  }
  function closeSheet() {
    if (!sheetEl) return;
    const el = sheetEl; sheetEl = null;
    el.classList.remove("open");
    setTimeout(() => el.remove(), 280);
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  }
  addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

  function locRow(l, { choose = false } = {}) {
    const st = status(l), cur = getPoint();
    return `<div class="loc-row${cur && cur.id === l.id ? " is-current" : ""}">
      <div class="loc-row-main">
        <b>${esc(l.name)}</b>
        <span>${esc(l.address)}</span>
        ${st.text ? `<small class="${st.orders ? "" : "closed"}">${esc(st.text)}${st.ordersText ? " · " + esc(st.ordersText) : ""}</small>` : ""}
      </div>
      <div class="loc-row-actions">
        ${choose ? `<button class="pill-btn" data-choose="${esc(l.id)}">${cur && cur.id === l.id ? "Выбран" : "Выбрать"}</button>` : ""}
        <a class="round-btn" href="${mapUrl(l)}" target="_blank" rel="noopener" aria-label="Маршрут: ${esc(l.name)}"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg></a>
        ${tel ? `<a class="round-btn" href="tel:${tel}" aria-label="Позвонить"><svg class="ic" aria-hidden="true"><use href="#i-phone"/></svg></a>` : ""}
      </div>
    </div>`;
  }
  function openPointSheet() {
    openSheet(`<h3 class="sheet-title">Ваш ресторан</h3>
      <p class="sheet-sub">Отсюда заберёте заказ или привезём доставку. Заказы на сайте — ${esc(orderHours())}.</p>
      <div class="loc-list">${LOCS.map(l => locRow(l, { choose: true })).join("")}</div>`, "Выбор ресторана");
    $$("[data-choose]", sheetEl).forEach(b => b.addEventListener("click", () => {
      setPoint(b.dataset.choose); closeSheet();
      window.PV?.toast?.(`Ресторан: ${locById(b.dataset.choose).name}`);
    }));
  }
  function orderHours() {
    const ws = LOCS.map(l => H && H.orderWindow(l, CUTOFF)).filter(Boolean);
    if (!ws.length) return "";
    const from = Math.min(...ws.map(w => w.from)), last = Math.max(...ws.map(w => w.last));
    return `с ${fmt(from)} до ${fmt(last)}`;
  }
  $("#pointBtn")?.addEventListener("click", openPointSheet);
  renderPointButton();

  /* ---------- Поиск в меню: кнопка-лупа раскрывает строку поиска ---------- */
  $("#searchToggle")?.addEventListener("click", () => {
    const on = root.classList.toggle("search-open");
    if (on) setTimeout(() => $("#search")?.focus(), 50);
  });

  /* ---------- Нижняя панель вкладок ---------- */
  const tabbar = $(".tabbar");
  if (tabbar) {
    $$("[data-tab]", tabbar).forEach(a => {
      const on = a.dataset.tab === page;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
    });
    const cartCount = () => {
      try { return Object.values(JSON.parse(localStorage.getItem(CART_KEY)) || {}).reduce((a, b) => a + b, 0); } catch { return 0; }
    };
    let shown = cartCount();
    const syncBadge = () => {
      const n = cartCount(), b = $("#tabCount"); if (!b) return;
      b.textContent = n; b.hidden = !n;
      if (n > shown) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); } // добавили блюдо — бейдж «подпрыгивает»
      shown = n;
    };
    syncBadge();
    addEventListener("storage", syncBadge);
    document.addEventListener("cart:change", syncBadge);
    // на странице меню корзина открывается сразу, на других — переход в меню с открытой корзиной
    $("[data-tab='cart']", tabbar)?.addEventListener("click", e => {
      if (window.PV?.openCart) { e.preventDefault(); window.PV.openCart(); }
    });
    // при прокрутке вниз панель уезжает, при прокрутке вверх — возвращается (как в приложениях)
    let lastY = scrollY, ticking = false;
    addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = scrollY;
        if (y > lastY + 6 && y > 140) { root.classList.add("tabbar-hidden"); lastY = y; }
        else if (y < lastY - 6 || y < 80) { root.classList.remove("tabbar-hidden"); lastY = y; }
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- Акции и купоны ---------- */
  const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // дата по Москве
  const day = s => { const [, m, d] = String(s).split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
  const TYPES = { permanent: "Постоянные", event: "Ивенты", coupon: "Купоны" };
  const LABELS = { permanent: "Акция", event: "Мероприятие", coupon: "Купон" };
  const promos = (CFG.promos || []).filter(p =>
    (demo || !p.demo) && (!p.until || p.until >= today) && (!p.date || p.date >= today) && (!p.from || p.from <= today || p.type === "event"));
  const dateText = p => p.date ? day(p.date) : p.until ? "до " + day(p.until) : p.type === "permanent" ? "Постоянно" : "";

  const promoCard = p => `<button class="promo-card promo-${esc(p.type)}" data-promo="${esc(p.id)}" style="--img:url('${esc(p.img || "images/pho-bo.jpg")}')">
      <span class="promo-frame" aria-hidden="true"></span>
      <span class="promo-label">${esc(p.label || LABELS[p.type] || "Акция")}</span>
      <span class="promo-title">${esc(p.title)}</span>
      ${dateText(p) ? `<span class="promo-date"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>${esc(dateText(p))}</span>` : ""}
      ${p.demo ? `<span class="promo-demo">пример</span>` : ""}
    </button>`;

  function openPromo(p) {
    const code = p.type === "coupon" && p.code ? `<div class="coupon-code">
        <span><small>Промокод</small><b>${esc(p.code)}</b></span>
        <button class="pill-btn" id="copyCode">Скопировать</button>
      </div>
      <p class="sheet-note">Введите промокод при оформлении заказа${p.minTotal ? ` — от ${rub(p.minTotal)}` : ""}.${p.demo ? " Это пример: купон пока не действует." : ""}</p>` : "";
    openSheet(`<div class="sheet-hero" style="--img:url('${esc(p.img || "images/pho-bo.jpg")}')"><span class="promo-label">${esc(p.label || LABELS[p.type] || "Акция")}</span></div>
      <h3 class="sheet-title">${esc(p.title)}</h3>
      ${dateText(p) ? `<p class="sheet-date"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>${esc(dateText(p))}</p>` : ""}
      ${p.text ? `<p class="sheet-text">${esc(p.text)}</p>` : ""}
      ${code}
      <a class="btn btn-primary btn-lg btn-block" href="${esc((p.cta && p.cta.href) || "/menu")}">${esc((p.cta && p.cta.text) || "Перейти в меню")}</a>`, p.title);
    $("#copyCode")?.addEventListener("click", async e => {
      try { await navigator.clipboard.writeText(p.code); e.target.textContent = "Скопировано"; }
      catch { e.target.textContent = p.code; }
    });
  }
  document.addEventListener("click", e => {
    const c = e.target.closest("[data-promo]");
    if (!c) return;
    const p = promos.find(x => x.id === c.dataset.promo) || EXTRA.find(x => x.id === c.dataset.promo);
    if (!p) return;
    if (p.href && !p.title) { location.href = p.href; return; }
    if (p.link) { location.href = p.link; return; }
    openPromo(p);
  });

  // Страница «Акции»: вкладки Все / Постоянные / Ивенты / Купоны
  const list = $("#promoList");
  if (list) {
    let filter = "all";
    const tabs = $("#promoTabs");
    const draw = () => {
      const counts = Object.fromEntries(Object.keys(TYPES).map(t => [t, promos.filter(p => p.type === t).length]));
      tabs.innerHTML = `<button class="promo-tab${filter === "all" ? " is-active" : ""}" data-filter="all">Все</button>` +
        Object.entries(TYPES).filter(([t]) => counts[t]).map(([t, name]) =>
          `<button class="promo-tab${filter === t ? " is-active" : ""}" data-filter="${t}"><b>${counts[t]}</b>${name}</button>`).join("");
      const shown = promos.filter(p => filter === "all" || p.type === filter);
      list.innerHTML = shown.map(promoCard).join("");
      $("#promoEmpty").hidden = shown.length > 0;
    };
    tabs.addEventListener("click", e => { const b = e.target.closest("[data-filter]"); if (b) { filter = b.dataset.filter; draw(); } });
    draw();
    if (demo) $("#promoDemoNote").hidden = false;
  }

  /* ---------- Главная приложения ---------- */
  // Баннеры: настоящие акции + полезные карточки (вакансия, фирменное блюдо)
  const vacancy = ((CFG.jobs && CFG.jobs.positions) || []).filter(p => p !== "Другое");
  const EXTRA = [
    { id: "x-pho", type: "permanent", label: "Фирменное", title: "Фо Бо — бульон 12 часов", img: "images/pho-bo.jpg", link: "/menu?dish=pho-bo" },
    vacancy.length ? { id: "x-jobs", type: "permanent", label: "Работа", title: `Ищем: ${vacancy.join(", ").toLowerCase()}`, img: "images/banh-bao.jpg", link: "/jobs" } : null
  ].filter(Boolean);

  const home = $("#appHome");
  if (home) {
    // баннеры с точками
    const rail = $("#homeRail"), dots = $("#homeDots");
    const banners = [...promos, ...EXTRA];
    rail.innerHTML = banners.map(promoCard).join("");
    dots.innerHTML = banners.map((_, i) => `<span class="${i ? "" : "is-active"}"></span>`).join("");
    const syncDots = () => {
      const i = Math.round(rail.scrollLeft / Math.max(1, rail.firstElementChild.offsetWidth + 12));
      $$("span", dots).forEach((d, k) => d.classList.toggle("is-active", k === i));
    };
    rail.addEventListener("scroll", () => requestAnimationFrame(syncDots), { passive: true });
    // баннеры листаются сами, пока гость их не трогает
    let auto = setInterval(() => {
      if (document.hidden || !banners.length) return;
      const w = rail.firstElementChild.offsetWidth + 12, max = rail.scrollWidth - rail.clientWidth;
      rail.scrollTo({ left: rail.scrollLeft + w > max + 4 ? 0 : rail.scrollLeft + w, behavior: "smooth" });
    }, 5000);
    ["touchstart", "pointerdown", "wheel"].forEach(ev => rail.addEventListener(ev, () => clearInterval(auto), { passive: true, once: true }));

    // оценка и цифры
    const r = CFG.rating || {};
    $("#homeRating").innerHTML = `<div class="rate-big"><b>${esc(String(r.value || "4.8").replace(".", ","))}</b><span class="stars" aria-hidden="true">★★★★★</span></div>
      <div class="rate-text"><b>${esc(r.count || "650+")} оценок</b><span>${esc(r.source || "Яндекс Еда")} · ${esc(r.liked || "гостям нравится наш фо")}</span></div>`;
    const anyOpen = LOCS.some(l => status(l).open);
    $("#homeStats").innerHTML = [
      [LOCS.length, ["ресторан", "ресторана", "ресторанов"][LOCS.length % 10 === 1 && LOCS.length % 100 !== 11 ? 0 : LOCS.length % 10 >= 2 && LOCS.length % 10 <= 4 && (LOCS.length % 100 < 10 || LOCS.length % 100 >= 20) ? 1 : 2] + " в Москве"],
      [anyOpen ? "Открыто" : "Закрыто", anyOpen ? "сейчас" : "сейчас · " + orderHours()],
      ["от " + rub(CFG.freeDeliveryFrom || 600), "доставка бесплатно"],
      ["30–60", "минут на доставку"]
    ].map(([a, b]) => `<div class="stat"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join("");

    // рестораны
    $("#homeLocs").innerHTML = LOCS.map(l => locRow(l, { choose: true })).join("");
    $("#homeLocs").addEventListener("click", e => {
      const b = e.target.closest("[data-choose]"); if (!b) return;
      setPoint(b.dataset.choose);
      location.href = "/menu";
    });
    $("#homeHours").textContent = `Заказы на сайте ${orderHours()}. ${CFG.hours || ""}`;

    // хиты
    const BY = Object.fromEntries((window.MENU || []).map(d => [d.id, d]));
    $("#homeHits").innerHTML = (window.POPULAR || []).map(id => BY[id]).filter(Boolean).map(d =>
      `<a class="hit-card" href="/menu?dish=${esc(d.id)}">
        <span class="hit-img"><img src="${esc(d.img)}" alt="" loading="lazy" width="300" height="300"></span>
        <b>${esc(d.name)}</b>
        <span class="hit-foot"><span class="price-pill">${rub(d.price)}</span><small>${esc(d.weight || "")}</small></span>
      </a>`).join("");

    $$(".js-tel").forEach(a => (a.href = "tel:" + tel));
    $$(".js-phone-text").forEach(e => (e.textContent = CFG.phone || ""));
  }
})();
