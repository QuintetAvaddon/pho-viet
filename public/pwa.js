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

  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; show(true); });
  addEventListener("appinstalled", () => {
    deferred = null; show(false);
    window.PV?.toast?.("Приложение установлено — ищите Phở Việt на экране телефона");
  });
  if (isIOS) show(true); // в Safari нет системной кнопки — покажем инструкцию

  btns.forEach(b => b.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === "accepted") show(false);
    } else if (isIOS) {
      const o = document.getElementById("iosInstall");
      if (o) window.PV?.openOverlay ? window.PV.openOverlay(o) : (o.hidden = false);
    }
  }));
})();
