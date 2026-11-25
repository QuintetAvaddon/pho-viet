/* Установка сайта как приложения (PWA) */
(() => {
  "use strict";
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
    // Пришла новая версия сайта — один раз перезагружаем страницу, чтобы не было смеси старых и новых файлов
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
  }

  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const btns = [...document.querySelectorAll(".js-install")];
  const show = on => btns.forEach(b => (b.hidden = !on));
  show(false);

  // Уже открыто как приложение — кнопки установки не нужны
  if (standalone) { document.documentElement.classList.add("is-app"); return; }

  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;

  // Встроенные браузеры (Telegram, Instagram, VK…) приложение не ставят — сначала нужно открыть сайт в браузере
  const inApp = /Telegram|Instagram|FBAN|FBAV|VKClient|; wv\)/i.test(ua) || (isIOS && !/Safari\//.test(ua));
  const isAndroid = /android/i.test(ua);
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; show(true); });
  addEventListener("appinstalled", () => {
    deferred = null; show(false);
    window.PV?.toast?.("Приложение установлено — ищите Phở Việt на экране телефона");
  });
  // Кнопка на телефонах есть всегда: если браузер сам не предлагает установку (Xiaomi, Samsung, Firefox,
  // встроенные браузеры), покажем, где в меню браузера пункт «Установить приложение»
  if (isIOS || isAndroid || matchMedia("(pointer: coarse)").matches) show(true);

  // Инструкция под конкретный телефон и браузер
  function fillSteps(box) {
    const ol = box.querySelector(".install-steps"); if (!ol || box.dataset.filled) return;
    box.dataset.filled = "1";
    const li = (n, html) => `<li><span class="step-n">${n}</span><span>${html}</span></li>`;
    let steps;
    if (inApp && isIOS) steps = [li(1, "Нажмите значок <b>компаса</b> или <b>···</b> — сайт откроется в <b>Safari</b>"), li(2, "В Safari нажмите <b>«Поделиться»</b> внизу экрана"), li(3, "Выберите <b>«На экран „Домой“»</b> и нажмите <b>«Добавить»</b>")];
    else if (inApp) steps = [li(1, "Нажмите <b>⋮</b> вверху и выберите <b>«Открыть в браузере»</b>"), li(2, "В браузере нажмите <b>⋮</b> (или <b>≡</b>)"), li(3, "Выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>")];
    else if (!isIOS) steps = [li(1, "Откройте меню браузера — <b>⋮</b> вверху или <b>≡</b> внизу экрана"), li(2, "Выберите <b>«Установить приложение»</b> или <b>«Добавить на главный экран»</b>"), li(3, "Подтвердите — иконка Phở Việt появится на экране")];
    if (steps) ol.innerHTML = steps.join("");
    const note = box.querySelector(".install-head .muted");
    if (note && !isIOS) note.textContent = "Иконка появится на экране телефона — меню и заказ в пару касаний.";
  }

  btns.forEach(b => b.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === "accepted") show(false);
    } else {
      const o = document.getElementById("iosInstall");
      if (!o) return;
      fillSteps(o);
      window.PV?.openOverlay ? window.PV.openOverlay(o) : (o.hidden = false);
    }
  }));
})();
