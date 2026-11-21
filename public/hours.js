/* Часы работы и приём заказов — общий код для сайта (браузер) и сервера (server.js).
   Время везде московское. Заказы принимаются с открытия точки и до закрытия
   минус SITE_CONFIG.orderCutoffMin минут (при 10:00–22:00 и 30 минутах — с 10:00 до 21:30). */
(function (root) {
  "use strict";
  const DAY = 1440;
  const api = {};

  // Минуты от полуночи по Москве. Москва живёт по UTC+3 круглый год,
  // поэтому часовой пояс телефона гостя или сервера не важен.
  api.mskNow = (date = new Date()) => ((Math.floor(date.getTime() / 60000) + 180) % DAY + DAY) % DAY;

  api.fmt = m => {
    m = ((m % DAY) + DAY) % DAY;
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  };

  // "10:00–22:00" → { from: 600, to: 1320 }; закрытие после полуночи: "10:00–00:00" → { from: 600, to: 1440 }
  api.parseHours = h => {
    const m = String(h || "").match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const from = +m[1] * 60 + +m[2];
    let to = +m[3] * 60 + +m[4];
    if (to <= from) to += DAY;
    return { from, to };
  };

  // Окно приёма заказов точки: { from, last }; заказать можно до last (в саму минуту last — уже нельзя).
  // Если у точки задано orderHours («10:00–21:30»), берём его; иначе — с открытия до закрытия минус cutoff.
  api.orderWindow = (loc, cutoff) => {
    const o = api.parseHours(loc && loc.orderHours);
    if (o) return { from: o.from, last: o.to };
    const h = api.parseHours(loc && loc.hours);
    return h ? { from: h.from, last: h.to - (cutoff || 0) } : null;
  };

  // Окно и «сейчас» внутри него (с учётом окон через полночь) или null, если заказы сейчас не принимаются
  api.windowNow = (loc, cutoff, now = api.mskNow()) => {
    const w = api.orderWindow(loc, cutoff);
    if (!w) return { from: 0, last: DAY, now }; // часы не указаны — принимаем всегда
    for (const t of [now, now + DAY]) if (t >= w.from && t < w.last) return { from: w.from, last: w.last, now: t };
    return null;
  };

  api.acceptsNow = (loc, cutoff, now) => !!api.windowNow(loc, cutoff, now);

  // Время «к HH:MM» на сегодня: не раньше чем через час, шагом 30 минут и не позже конца приёма
  api.slots = (loc, cutoff, now = api.mskNow(), step = 30, lead = 60) => {
    const w = api.windowNow(loc, cutoff, now);
    if (!w) return [];
    const out = [];
    for (let t = Math.ceil(w.now / step) * step + lead; t <= w.last && out.length < 48; t += step) out.push(t);
    return out;
  };

  // Проверка времени из заказа: "asap" или "HH:MM" внутри сегодняшнего окна приёма
  api.validTime = (loc, cutoff, value, now = api.mskNow()) => {
    const w = api.windowNow(loc, cutoff, now);
    if (!w) return false;
    if (value === "asap") return true;
    const m = String(value).match(/^(\d{2}):(\d{2})$/);
    if (!m) return false;
    const t = +m[1] * 60 + +m[2];
    return [t, t + DAY].some(x => x >= w.now - 10 && x <= w.last);
  };

  root.PV_HOURS = api;
})(typeof window !== "undefined" ? window : globalThis);
