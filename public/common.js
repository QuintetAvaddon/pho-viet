/* Общие помощники для скриптов сайта (app.js, appshell.js, jobs.js, fx.js) — один раз для всех страниц.
   Подключается после menu.js (нужен SITE_CONFIG). */
(() => {
  "use strict";
  const CFG = window.SITE_CONFIG || {};
  const LOCS = Array.isArray(CFG.locations) ? CFG.locations : [];
  const CART_KEY = "phoviet_cart_v1";
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  // Маска телефона +7 (XXX) XXX-XX-XX: 8 в начале меняем на 7, лишние цифры отбрасываем
  const formatPhone = value => {
    let d = String(value).replace(/\D/g, "");
    if (d.startsWith("8")) d = "7" + d.slice(1);
    if (!d.startsWith("7")) d = "7" + d;
    d = d.slice(0, 11);
    if (d.length < 2) return "";
    const [a, b, c, e] = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    return "+7 (" + a + (a.length === 3 ? ")" : "") + (b ? " " + b : "") + (c ? "-" + c : "") + (e ? "-" + e : "");
  };

  window.PV_UTIL = {
    CFG, LOCS, CART_KEY,
    POINT_KEY: "phoviet_point",
    CUTOFF: CFG.orderCutoffMin ?? 30, // приём заказов заканчивается за столько минут до закрытия
    coarse: matchMedia("(pointer: coarse)").matches, // сенсорный экран
    $: (s, el = document) => el.querySelector(s),
    $$: (s, el = document) => [...el.querySelectorAll(s)],
    esc: s => String(s ?? "").replace(/[&<>"']/g, c => ESC[c]),
    rub: n => Number(n).toLocaleString("ru-RU") + " ₽", // неразрывный пробел: «710 ₽» не переносится
    // 1 ресторан, 2 ресторана, 5 ресторанов
    plural: (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2],
    locById: id => LOCS.find(l => l.id === id),
    mapUrl: l => "https://yandex.ru/maps/?text=" + encodeURIComponent(/москва/i.test(l.address || "") ? l.address : "Москва, " + (l.address || "")),
    telHref: s => String(s || "").replace(/[^\d+]/g, ""),
    readCart: () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; } },
    formatPhone,
    phoneMask: input => input && input.addEventListener("input", () => { input.value = formatPhone(input.value); }),
    // Пока открыто окно, фон под ним не прокручивается пальцем (без overflow:hidden у body — он перестраивает
    // всю страницу и тормозит): листается только содержимое окна sel, если ему есть куда листаться
    holdTouch: sel => e => {
      const sc = e.target.closest?.(sel);
      if (!sc || sc.scrollHeight <= sc.clientHeight + 1) e.preventDefault();
    }
  };
})();
