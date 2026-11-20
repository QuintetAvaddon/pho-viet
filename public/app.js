(() => {
  "use strict";

  const CFG = window.SITE_CONFIG;
  const MENU = window.MENU;
  const BY_ID = Object.fromEntries(MENU.map(d => [d.id, d]));
  const CART_KEY = "phoviet_cart_v1";
  const ORDERS_KEY = "phoviet_orders_v1";

  const BG = { bowl: "#3a1a24", rice: "#33241c", wok: "#3a2414", roll: "#3a1e1c", salad: "#1e2e1a", bao: "#2c2430", sauce: "#3a1418", drink: "#3a2412", can: "#2a1a26" };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const rub = n => n.toLocaleString("ru-RU") + " ₽";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const art = d => d.img
    ? `<img src="${esc(d.img)}" alt="" loading="lazy" decoding="async" width="600" height="600">`
    : `<svg aria-hidden="true"><use href="#d-${d.icon}"/></svg>`;
  const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];

  /* ---------- Cart state ---------- */
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { cart = {}; }
  for (const id of Object.keys(cart)) if (!BY_ID[id]) delete cart[id];

  const save = () => localStorage.setItem(CART_KEY, JSON.stringify(cart));
  const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = () => Object.entries(cart).reduce((s, [id, q]) => s + BY_ID[id].price * q, 0);
  const isPickup = () => $('input[name="method"]:checked')?.value === "pickup";
  const deliveryFee = (sub, pickup) => pickup || sub === 0 || sub >= CFG.freeDeliveryFrom ? 0 : CFG.deliveryFee;

  function setQty(id, q) {
    if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 99);
    save(); renderAll();
  }
  function add(id, q = 1) {
    setQty(id, (cart[id] || 0) + q);
    const b = $("#cartCount"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
    toast(`«${BY_ID[id].name}» в корзине`);
  }

  /* ---------- Rendering ---------- */
  function tagsHtml(d) {
    const t = [];
    if (d.badge) t.push(`<span class="tag tag-hit">${esc(d.badge)}</span>`);
    if (d.tags.includes("hit")) t.push(`<span class="tag tag-hit">Хит</span>`);
    if (d.tags.includes("spicy")) t.push(`<span class="tag tag-spicy"><svg class="ic" aria-hidden="true"><use href="#i-chili"/></svg>Острое</span>`);
    if (d.tags.includes("veg")) t.push(`<span class="tag tag-veg"><svg class="ic" aria-hidden="true"><use href="#i-leaf"/></svg>Вег</span>`);
    return t.join("");
  }

  function controlHtml(d) {
    const q = cart[d.id];
    if (!q) return `<button class="add-btn" data-add="${d.id}" aria-label="Добавить «${esc(d.name)}» в корзину"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg><span class="lbl">В корзину</span></button>`;
    return `<div class="mini-stepper" role="group" aria-label="Количество «${esc(d.name)}»">
      <button data-dec="${d.id}" aria-label="Убрать одну порцию"><svg class="ic" aria-hidden="true"><use href="#i-minus"/></svg></button>
      <span>${q}</span>
      <button data-inc="${d.id}" aria-label="Добавить ещё порцию"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg></button>
    </div>`;
  }

  function cardHtml(d) {
    const rating = d.rating ? `<span class="rating" title="Нравится ${d.rating}% гостей"><svg class="ic" aria-hidden="true"><use href="#i-thumb"/></svg>${d.rating}%</span>` : "";
    return `<article class="card" style="--card-bg:${BG[d.icon]}" data-id="${d.id}">
      <button class="card-art" data-open="${d.id}" aria-label="Подробнее: ${esc(d.name)}">${art(d)}</button>
      <div class="card-badges">${tagsHtml(d)}</div>
      <div class="card-body">
        <button class="card-title" data-open="${d.id}">${esc(d.name)}</button>
        <div class="card-meta"><span>${esc(d.weight)}</span>${rating}</div>
        <div class="card-foot"><span class="price">${rub(d.price)}</span><span class="ctl">${controlHtml(d)}</span></div>
      </div>
    </article>`;
  }

  function renderMenu() {
    if (!$("#menuSections")) return; // на главной меню нет
    const term = $("#search").value.trim().toLowerCase();
    const cats = window.CATEGORIES.filter(c => c.id !== "popular");
    let shown = 0;
    $("#menuSections").innerHTML = cats.map(c => {
      const items = MENU.filter(d => d.cat === c.id && (!term || (d.name + " " + d.desc).toLowerCase().includes(term)));
      shown += items.length;
      if (!items.length) return "";
      return `<section class="menu-section" id="cat-${c.id}" aria-labelledby="h-${c.id}">
        <h2 id="h-${c.id}">${esc(c.name)} <span class="count">${items.length}</span></h2>
        <div class="grid">${items.map(cardHtml).join("")}</div>
      </section>`;
    }).join("");
    $("#emptySearch").hidden = shown > 0;
    $("#catNav").innerHTML = cats
      .filter(c => !term || $("#cat-" + c.id))
      .map(c => `<a class="chip" href="#cat-${c.id}" data-cat="${c.id}">${esc(c.name)}</a>`).join("");
    observeSections();
  }

  function renderPopular() {
    if (!$("#popularRow")) return;
    $("#popularRow").innerHTML = window.POPULAR.map(id => cardHtml(BY_ID[id])).join("");
  }

  // Обновляем только кнопки в карточках, не перерисовывая сетку (без скачков и потери фокуса)
  function refreshControls() {
    $$(".card").forEach(card => {
      const d = BY_ID[card.dataset.id];
      const ctl = $(".ctl", card);
      const had = ctl.contains(document.activeElement) ? document.activeElement.dataset : null;
      ctl.innerHTML = controlHtml(d);
      if (had) {
        const sel = had.inc ? `[data-inc]` : had.dec ? `[data-dec]` : `[data-add]`;
        (ctl.querySelector(sel) || ctl.querySelector("button"))?.focus();
      }
    });
  }

  function totalsHtml(pickup) {
    const sub = subtotal(), fee = deliveryFee(sub, pickup);
    return `<div class="totals">
      <div><span>Блюда</span><span>${rub(sub)}</span></div>
      <div><span>${pickup ? "Самовывоз" : "Доставка"}</span><span>${fee ? rub(fee) : "бесплатно"}</span></div>
      <div class="grand"><span>Итого</span><span>${rub(sub + fee)}</span></div>
    </div>`;
  }

  function renderCart() {
    const n = count(), sub = subtotal();
    $("#cartCount").textContent = n;
    $("#headerTotal").textContent = rub(sub);
    $("#mobileCount").textContent = n;
    $("#mobileTotal").textContent = rub(sub + deliveryFee(sub, false));
    $("#mobileCart").hidden = n === 0 || window.innerWidth > 720;

    const body = $("#cartBody"), foot = $("#cartFoot");
    if (!n) {
      body.innerHTML = `<div class="cart-empty"><svg aria-hidden="true"><use href="#d-bowl"/></svg>
        <p><b>Корзина пока пуста</b><br>Начните с фирменного Фо Бо — его заказывают чаще всего.</p>
        <button class="btn btn-primary" data-add="pho-bo">Добавить Фо Бо</button></div>`;
      foot.innerHTML = "";
      return;
    }
    body.innerHTML = Object.entries(cart).map(([id, q]) => {
      const d = BY_ID[id];
      return `<div class="cart-item">
        <div class="cart-thumb" style="--card-bg:${BG[d.icon]}">${art(d)}</div>
        <div><div class="cart-item-name">${esc(d.name)}</div><div class="cart-item-sub">${esc(d.weight)} · ${rub(d.price * q)}</div></div>
        <div class="stepper" role="group" aria-label="Количество «${esc(d.name)}»">
          <button class="icon-btn" data-dec="${id}" aria-label="${q === 1 ? "Удалить" : "Убрать одну порцию"}"><svg class="ic" aria-hidden="true"><use href="#i-minus"/></svg></button>
          <span>${q}</span>
          <button class="icon-btn" data-inc="${id}" aria-label="Добавить порцию"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg></button>
        </div>
      </div>`;
    }).join("");

    const left = CFG.freeDeliveryFrom - sub;
    const pct = Math.min(100, (sub / CFG.freeDeliveryFrom) * 100);
    foot.innerHTML = `
      <div class="free-progress ${left <= 0 ? "done" : ""}">
        ${left > 0 ? `Добавьте блюд на <b>${rub(left)}</b> — доставка станет бесплатной` : "Доставка бесплатная"}
        <div class="bar"><span style="width:${pct}%"></span></div>
      </div>
      ${totalsHtml(false)}
      <button class="btn btn-primary btn-lg btn-block" id="toCheckout">Оформить заказ</button>`;
  }

  function renderAll() {
    refreshControls();
    renderCart();
    if (!$("#checkoutOverlay").hidden) $("#checkoutSummary").innerHTML = totalsHtml(isPickup());
  }

  /* ---------- Overlays (focus trap, Esc, scroll lock) ---------- */
  let lastFocus = null;
  function openOverlay(el, focusSel) {
    $$(".overlay:not([hidden])").forEach(o => (o.hidden = true));
    lastFocus = lastFocus || document.activeElement;
    el.hidden = false;
    document.body.style.overflow = "hidden";
    document.dispatchEvent(new Event("overlay:open"));
    requestAnimationFrame(() => (focusSel ? $(focusSel, el) : $("button, input, a", el))?.focus());
  }
  function closeOverlay(el) {
    el.hidden = true;
    if (!$(".overlay:not([hidden])")) {
      document.body.style.overflow = "";
      document.dispatchEvent(new Event("overlay:close"));
      lastFocus?.focus?.(); lastFocus = null;
    }
  }
  document.addEventListener("keydown", e => {
    const open = $(".overlay:not([hidden])");
    if (!open) return;
    if (e.key === "Escape") closeOverlay(open);
    if (e.key === "Tab") {
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', open).filter(x => !x.disabled && x.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  $$(".overlay").forEach(o => o.addEventListener("click", e => {
    if (e.target === o || e.target.closest("[data-close]")) closeOverlay(o);
  }));

  /* ---------- Dish modal ---------- */
  let dishId = null, dishQty = 1;
  function openDish(id) {
    const d = BY_ID[id]; dishId = id; dishQty = 1;
    $("#dishArt").style.setProperty("--card-bg", BG[d.icon]);
    $("#dishArt").innerHTML = art(d);
    $("#dishTags").innerHTML = tagsHtml(d);
    $("#dishName").textContent = d.name;
    $("#dishMeta").textContent = d.weight + (d.rating ? ` · нравится ${d.rating}% гостей` : "");
    $("#dishDesc").textContent = d.desc;
    updDish();
    openOverlay($("#dishOverlay"), "#dishAdd");
  }
  function updDish() {
    $("#dishQty").textContent = dishQty;
    $("#dishAdd").textContent = `Добавить · ${rub(BY_ID[dishId].price * dishQty)}`;
  }
  $("#dishMinus").addEventListener("click", () => { dishQty = Math.max(1, dishQty - 1); updDish(); });
  $("#dishPlus").addEventListener("click", () => { dishQty = Math.min(99, dishQty + 1); updDish(); });
  $("#dishAdd").addEventListener("click", () => { add(dishId, dishQty); closeOverlay($("#dishOverlay")); });

  /* ---------- Global clicks ---------- */
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-add],[data-inc],[data-dec],[data-open],#toCheckout,#cartOpen,#mobileCart");
    if (!t) return;
    if (t.dataset.add) add(t.dataset.add);
    else if (t.dataset.inc) setQty(t.dataset.inc, (cart[t.dataset.inc] || 0) + 1);
    else if (t.dataset.dec) setQty(t.dataset.dec, (cart[t.dataset.dec] || 0) - 1);
    else if (t.dataset.open) openDish(t.dataset.open);
    else if (t.id === "toCheckout") openCheckout();
    else openOverlay($("#cartOverlay"));
  });

  /* ---------- Search & category scrollspy ---------- */
  let searchTimer;
  $("#search")?.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderMenu, 150); });

  let io;
  function observeSections() {
    io?.disconnect();
    io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const id = en.target.id.replace("cat-", "");
        $$("#catNav .chip").forEach(c => c.setAttribute("aria-current", c.dataset.cat === id ? "true" : "false"));
        const active = $(`#catNav [data-cat="${id}"]`);
        if (active) { const nav = $("#catNav"); nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2; }
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    $$(".menu-section").forEach(s => io.observe(s));
  }

  /* ---------- Checkout ---------- */
  const form = $("#checkoutForm");

  function fillTimes() {
    const sel = $("#fTime");
    const opts = [`<option value="asap">Как можно скорее</option>`];
    const now = new Date(); now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30 + 60, 0, 0);
    for (let i = 0; i < 16; i++) {
      const t = new Date(now.getTime() + i * 30 * 60000);
      if (t.getHours() >= 22 || t.getHours() < 10) continue;
      const s = t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      opts.push(`<option value="${s}">Сегодня к ${s}</option>`);
    }
    sel.innerHTML = opts.join("");
  }

  function openCheckout() {
    if (!count()) return;
    $("#checkoutView").hidden = false; $("#successView").hidden = true;
    fillTimes();
    const saved = JSON.parse(localStorage.getItem("phoviet_contact") || "{}");
    for (const k of ["name", "phone", "street", "flat", "entrance", "floor"]) if (saved[k] && !form[k].value) form[k].value = saved[k];
    syncForm();
    openOverlay($("#checkoutOverlay"), "#fName");
  }

  function syncForm() {
    const pickup = isPickup();
    $("#addressGroup").hidden = pickup;
    $("#fStreet").required = !pickup;
    $("#changeField").hidden = form.payment.value !== "cash";
    $("#checkoutSummary").innerHTML = totalsHtml(pickup);
  }
  form.addEventListener("change", e => { if (["method", "payment"].includes(e.target.name)) syncForm(); });

  // Маска телефона +7 (XXX) XXX-XX-XX
  $("#fPhone").addEventListener("input", e => {
    let d = e.target.value.replace(/\D/g, "");
    if (d.startsWith("8")) d = "7" + d.slice(1);
    if (!d.startsWith("7")) d = "7" + d;
    d = d.slice(0, 11);
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    let out = "+7";
    if (p[0]) out += ` (${p[0]}`;
    if (p[0].length === 3) out += ")";
    if (p[1]) out += ` ${p[1]}`;
    if (p[2]) out += `-${p[2]}`;
    if (p[3]) out += `-${p[3]}`;
    e.target.value = d.length > 1 ? out : "";
  });

  const rules = {
    fName: v => v.trim().length >= 2 || "Укажите имя",
    fPhone: v => v.replace(/\D/g, "").length === 11 || "Введите телефон полностью: +7 и 10 цифр",
    fStreet: v => isPickup() || v.trim().length >= 5 || "Укажите улицу и номер дома"
  };
  function validateField(id) {
    const el = $("#" + id), res = rules[id](el.value);
    const msg = res === true ? "" : res;
    $(`#${id}-err`).textContent = msg;
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg) el.setAttribute("aria-describedby", `${id}-err`); else el.removeAttribute("aria-describedby");
    return !msg;
  }
  Object.keys(rules).forEach(id => $("#" + id).addEventListener("blur", () => { if ($("#" + id).value) validateField(id); }));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const bad = Object.keys(rules).filter(id => !validateField(id));
    const consent = $("#fConsent").checked;
    $("#fConsent-err").textContent = consent ? "" : "Нужно согласие, чтобы мы могли связаться с вами по заказу";
    if (bad.length) { $("#" + bad[0]).focus(); return; }
    if (!consent) { $("#fConsent").focus(); return; }

    const pickup = isPickup(), sub = subtotal(), fee = deliveryFee(sub, pickup);
    const fd = Object.fromEntries(new FormData(form));
    const order = {
      id: String(Date.now()).slice(-6),
      createdAt: new Date().toISOString(),
      method: pickup ? "pickup" : "delivery",
      customer: { name: fd.name.trim(), phone: fd.phone },
      address: pickup ? null : { street: fd.street, flat: fd.flat, entrance: fd.entrance, floor: fd.floor },
      time: fd.time, payment: fd.payment, change: fd.change || null, comment: fd.comment || "",
      items: Object.entries(cart).map(([id, q]) => ({ id, name: BY_ID[id].name, price: BY_ID[id].price, qty: q })),
      subtotal: sub, delivery: fee, total: sub + fee
    };

    const btn = $("#submitBtn");
    showSubmitError("");
    btn.disabled = true; btn.textContent = "Отправляем…";
    try {
      if (CFG.orderEndpoint) {
        const r = await fetch(CFG.orderEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok || !res.ok) throw new Error(res.error || "HTTP " + r.status);
        order.id = res.id; order.total = res.total;
      }
      const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
      orders.push(order); localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
      localStorage.setItem("phoviet_contact", JSON.stringify({ name: fd.name, phone: fd.phone, street: fd.street, flat: fd.flat, entrance: fd.entrance, floor: fd.floor }));

      cart = {}; save(); renderAll();
      $("#checkoutView").hidden = true; $("#successView").hidden = false;
      const when = order.time === "asap" ? (pickup ? "через 20–30 минут" : "в течение 30–60 минут") : `к ${order.time}`;
      $("#successText").innerHTML = `Номер заказа <b>№${order.id}</b> на сумму <b>${rub(order.total)}</b>.<br>
        ${pickup ? `Заказ будет готов ${when}.` : `Курьер привезёт его ${when}.`} Мы позвоним на ${esc(order.customer.phone)} для подтверждения.`;
      $("#successTitle").focus();
      form.reset();
    } catch (err) {
      showSubmitError(`${err.message.startsWith("HTTP") || err.name === "TypeError" ? "Не удалось отправить заказ" : err.message}. Попробуйте ещё раз или позвоните нам: ${CFG.phone}`);
    } finally {
      btn.disabled = false; btn.textContent = "Подтвердить заказ";
    }
  });

  function showSubmitError(msg) {
    const el = $("#submitErr");
    el.textContent = msg;
    if (msg) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------- Static info ---------- */
  $$(".js-phone").forEach(e => (e.textContent = CFG.phone));
  $$(".js-phone-link").forEach(e => (e.href = "tel:" + CFG.phone.replace(/[^\d+]/g, "")));
  $$(".js-address").forEach(e => (e.textContent = CFG.address));
  $$(".js-hours").forEach(e => (e.textContent = CFG.hours));
  $$(".js-free").forEach(e => (e.textContent = rub(CFG.freeDeliveryFrom)));
  $$(".js-fee").forEach(e => (e.textContent = rub(CFG.deliveryFee)));
  $("#year").textContent = new Date().getFullYear();
  window.addEventListener("resize", () => { $("#mobileCart").hidden = count() === 0 || window.innerWidth > 720; });

  /* ---------- Карусели со стрелками (главы, хиты) ---------- */
  function initSlider(trackSel, prevSel, nextSel, barSel, arrowsSel) {
    const track = $(trackSel), prev = $(prevSel), next = $(nextSel), bar = $(barSel), arrows = $(arrowsSel);
    if (!track || !prev || !next) return;
    const step = () => {
      const item = track.firstElementChild;
      return item ? item.offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 16) : 320;
    };
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 4;
      next.disabled = track.scrollLeft >= max - 4;
      if (arrows) arrows.hidden = max <= 4;
      if (bar) {
        // полоска = видимая часть ленты, сдвигается вместе с прокруткой
        const w = track.scrollWidth ? (track.clientWidth / track.scrollWidth) * 100 : 100;
        bar.style.width = Math.min(100, w) + "%";
        bar.style.marginLeft = (max > 0 ? (track.scrollLeft / track.scrollWidth) * 100 : 0) + "%";
      }
    };
    // Плавная прокрутка через GSAP: нативный smooth + scroll-snap: mandatory в Chrome иногда срывается и откатывает ленту
    const go = dir => {
      const max = track.scrollWidth - track.clientWidth;
      const target = Math.max(0, Math.min(max, track.scrollLeft + dir * step()));
      if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        track.style.scrollSnapType = "none";
        window.gsap.to(track, { scrollLeft: target, duration: 0.6, ease: "power2.out", overwrite: true, onComplete: () => { track.style.scrollSnapType = ""; sync(); } });
      } else {
        track.scrollTo({ left: target });
      }
    };
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    track.addEventListener("scroll", sync, { passive: true });
    addEventListener("resize", sync);
    if ("ResizeObserver" in window) new ResizeObserver(sync).observe(track);
    sync();
  }

  window.PV = { openOverlay, toast };

  renderPopular();
  renderMenu();
  renderCart();
  initSlider("#storyTrack", "#storyPrev", "#storyNext", "#storyBar", "#storyArrows");
  initSlider("#popularRow", "#hitsPrev", "#hitsNext", "#hitsBar", "#hitsArrows");
})();
