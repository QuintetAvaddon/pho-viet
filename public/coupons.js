/* Купоны (промокоды): общая проверка для сайта (браузер) и сервера (server.js) — скидка считается одинаково.
   Купоны описаны в SITE_CONFIG.promos (menu.js) с type: "coupon". Примеры (demo: true) не действуют. */
(function (root) {
  "use strict";
  // дата по Москве в виде ГГГГ-ММ-ДД
  const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

  // Действующие купоны: есть код, это не пример, дата подходит
  const active = (promos, day = today()) => (promos || []).filter(p =>
    p && p.type === "coupon" && p.code && !p.demo && (!p.from || p.from <= day) && (!p.until || p.until >= day));

  // Проверка промокода для суммы блюд subtotal → { ok, code, discount } или { ok: false, message }
  function check(code, subtotal, promos, day) {
    const c = String(code || "").trim().toUpperCase();
    if (!c) return { ok: false, reason: "empty", message: "Введите промокод" };
    const p = active(promos, day).find(x => String(x.code).trim().toUpperCase() === c);
    if (!p) return { ok: false, reason: "not_found", message: "Такого промокода нет или он уже не действует" };
    if (p.minTotal && subtotal < p.minTotal) {
      return { ok: false, reason: "min_total", message: `Промокод действует для заказа от ${Number(p.minTotal).toLocaleString("ru-RU")} ₽` };
    }
    const discount = p.percent ? Math.round(subtotal * p.percent / 100) : Math.min(Math.round(p.amount || 0), subtotal);
    if (!(discount > 0)) return { ok: false, reason: "zero", message: "Промокод не даёт скидки на этот заказ" };
    return { ok: true, code: String(p.code).trim().toUpperCase(), title: p.title || "", discount };
  }

  root.PV_COUPON = { today, active, check };
})(typeof window !== "undefined" ? window : globalThis);
