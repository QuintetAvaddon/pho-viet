/* Визуальные эффекты: сцена, параллакс, частицы, плавный скролл.
   Логика заказа живёт в app.js и от этого файла не зависит. */
(() => {
  "use strict";
  const { $, $$ } = window.PV_UTIL;
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  // Режимы: full — компьютер с мышью; touch — телефоны и планшеты. Анимации те же, но на телефоне
  // при прокрутке двигаются только готовые слои на видеокарте, ничего не перерисовывается. Проверка: ?fx=full|touch
  const q = new URLSearchParams(location.search).get("fx");
  const touch = q === "full" ? false : q === "touch" ? true : !finePointer;
  root.classList.add(touch ? "fx-touch" : "fx-full");

  // Стабильная высота экрана (--svh, 1% высоты). Встроенные браузеры (Telegram, Instagram…) меняют высоту окна,
  // когда прячут свои панели при прокрутке — с обычными 100svh первый экран перестраивался прямо на ходу и дёргался.
  // Высоту берём при загрузке и меняем только при повороте экрана, изменении окна на компьютере или если окно стало ниже.
  let vw0 = innerWidth, vh0 = innerHeight;
  root.style.setProperty("--svh", vh0 / 100 + "px");
  addEventListener("resize", () => {
    const w = innerWidth, h = innerHeight, turned = Math.abs(w - vw0) > 1;
    if (touch && !turned && h >= vh0 - 1) return; // панели браузера спрятались — высоту не трогаем
    vw0 = w; vh0 = h;
    root.style.setProperty("--svh", h / 100 + "px");
  });

  // Слои первого экрана и сборки фо отдаём видеокарте заранее — за экран до появления секции, чтобы браузер
  // успел их подготовить до того, как они понадобятся. Класс ставим на саму секцию, а не на весь документ.
  const near = sel => {
    const el = $(sel); if (!el) return;
    new IntersectionObserver(([e]) => el.classList.toggle("is-near", e.isIntersecting), { rootMargin: "100% 0px" }).observe(el);
  };
  near("#heroTrack");
  near("#assemble");

  const hideLoader = () => {
    const l = $("#loader"); if (!l) return;
    l.classList.add("done");
    setTimeout(() => { l.style.display = "none"; }, 900); // убираем совсем, чтобы не рисовался и не грузил браузер
  };

  // Шапка становится стеклянной после начала прокрутки (работает и без GSAP)
  const header = $(".site-header");
  const onScrollHeader = () => header.classList.toggle("scrolled", scrollY > 40);
  addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- Угольки фонарей и лепестки лотоса (только компьютер) ---------- */
  function particles() {
    const c = $("#particles"); if (!c || reduced || touch) return;
    const ctx = c.getContext("2d");
    let w, h, parts = [];
    // спрайт уголька рисуем один раз
    const ember = document.createElement("canvas"); ember.width = ember.height = 64;
    { const ec = ember.getContext("2d"), g = ec.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,200,120,1)"); g.addColorStop(0.4, "rgba(255,110,60,.5)"); g.addColorStop(1, "rgba(200,50,58,0)");
      ec.fillStyle = g; ec.fillRect(0, 0, 64, 64); }
    const make = (init) => {
      const petal = Math.random() < 0.45;
      return petal
        ? { k: "p", x: Math.random() * w, y: init ? Math.random() * h : -20, vx: 0.2 + Math.random() * 0.5, vy: 0.4 + Math.random() * 0.7, r: 5 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.04, sw: Math.random() * 6, hue: Math.random() < 0.6 ? "#c9544c" : (Math.random() < 0.5 ? "#f1dccd" : "#b5d17a") }
        : { k: "e", x: Math.random() * w, y: init ? Math.random() * h : h + 10, vx: (Math.random() - 0.5) * 0.3, vy: -(0.3 + Math.random() * 0.8), r: 0.8 + Math.random() * 2.2, life: Math.random(), sw: Math.random() * 6 };
    };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parts = Array.from({ length: 70 }, () => make(true));
    };
    resize(); addEventListener("resize", resize);
    let visible = true, running = false, mx = 0;
    addEventListener("pointermove", e => (mx = (e.clientX / innerWidth - 0.5) * 2), { passive: true });
    const tick = t => {
      if (!visible) { running = false; return; } // сцена ушла с экрана — цикл останавливается
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.sw += 0.02;
        if (p.k === "p") {
          p.x += p.vx + Math.sin(p.sw) * 0.6 + mx * 0.4; p.y += p.vy; p.a += p.va;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(1, 0.55 + 0.45 * Math.sin(p.sw * 2));
          ctx.globalAlpha = 0.85; ctx.fillStyle = p.hue;
          ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          if (p.y > h + 20 || p.x > w + 30) parts[i] = make(false);
        } else {
          p.x += p.vx + Math.sin(p.sw) * 0.3 + mx * 0.2; p.y += p.vy; p.life += 0.003;
          const a = Math.max(0, Math.sin(p.life * Math.PI)) * (0.5 + 0.5 * Math.sin(t * 0.01 + p.sw));
          const sz = p.r * 10;
          ctx.globalAlpha = a; ctx.drawImage(ember, p.x - sz / 2, p.y - sz / 2, sz, sz);
          if (p.y < -20 || p.life > 1) parts[i] = make(false);
        }
      }
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !running) { running = true; requestAnimationFrame(tick); }
    }).observe(c);
  }

  /* ---------- Лепестки и угольки на телефоне: CSS-анимации на видеокарте вместо холста ---------- */
  function cssPetals() {
    const scene = $("#scene"); if (!scene || reduced || !touch) return;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const colors = ["#c9544c", "#c9544c", "#f1dccd", "#c9544c", "#b5d17a"];
    let h = "";
    for (let i = 0; i < 12; i++) {
      h += `<i style="--x:${rnd(-5, 95).toFixed(1)}vw;--dx:${rnd(8, 30).toFixed(1)}vw;--d:${rnd(9, 16).toFixed(1)}s;--dl:${(-rnd(0, 16)).toFixed(1)}s;--s:${rnd(0.7, 1.4).toFixed(2)};--r:${Math.round(rnd(180, 540)) * (i % 2 ? -1 : 1)}deg;--c:${colors[i % colors.length]}"><b></b></i>`;
    }
    for (let i = 0; i < 6; i++) {
      h += `<u style="--x:${rnd(5, 95).toFixed(1)}vw;--dx:${rnd(-6, 6).toFixed(1)}vw;--d:${rnd(6, 11).toFixed(1)}s;--dl:${(-rnd(0, 11)).toFixed(1)}s"></u>`;
    }
    const box = document.createElement("div");
    box.className = "layer petals"; box.setAttribute("aria-hidden", "true"); box.innerHTML = h;
    const canvas = $("#particles");
    if (canvas) canvas.replaceWith(box); else scene.append(box);
  }

  particles();
  cssPetals();

  // Без GSAP или при reduced motion — показываем статичную версию
  if (reduced || !window.gsap || !window.ScrollTrigger) {
    root.classList.add("no-fx");
    hideLoader();
    return;
  }

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  // Закрепление экранов — position: sticky в CSS: его держит сам браузер, поэтому на iPhone блок не дёргается
  // при прокрутке вверх и у верха страницы. Анимация идёт, пока секция стоит: длина = дорожка минус секция.
  const stickRun = (track, stick) => Math.max(1, $(track).offsetHeight - $(stick).offsetHeight);

  /* ---------- Плавный скролл ---------- */
  let lenis = null;
  if (window.Lenis && finePointer) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true, anchors: { offset: -90 } });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.scrollTo(0, { immediate: true, force: true });
    window.PV_LENIS = lenis;
    // закреплённые секции меняют высоту страницы — сообщаем Lenis новый предел прокрутки
    ScrollTrigger.addEventListener("refresh", () => lenis.resize());
    document.addEventListener("overlay:open", () => lenis.stop());
    document.addEventListener("overlay:close", () => lenis.start());
  }

  /* ---------- Разбивка заголовков на слова ---------- */
  $$(".split").forEach(el => {
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const w = document.createElement("span"); w.className = "w";
            const i = document.createElement("span"); i.textContent = part;
            w.append(i); frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
      });
    };
    walk(el);
  });

  /* ---------- Интро после загрузки ---------- */
  const letters = $$(".gl");
  gsap.set(letters, { y: () => innerHeight * 0.7, opacity: 0 });
  // Интро и прокрутка двигают разные свойства слоёв (интро — масштаб неба и прозрачность, прокрутка — сдвиг
  // и масштаб города), а мышь — x/y: анимации не перебивают друг друга
  gsap.set(".sky", { scale: 1.15, opacity: 0 });
  gsap.set([".town", ".front"], { opacity: 0 });
  gsap.set(".lantern", { y: -200 });
  gsap.set(".hero-ui > :not(.hero-copy-wrap)", { opacity: 0 });

  const intro = () => {
    hideLoader();
    const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    tl.to(".sky", { scale: 1, opacity: 1, duration: 2.4 }, 0.1)
      .to(".town", { opacity: 1, duration: 1.6 }, 0.5)
      .to(".front", { opacity: 1, duration: 1.4 }, 0.9)
      .to(".lantern", { y: 0, duration: 2, ease: "elastic.out(1, 0.5)", stagger: 0.12 }, 1)
      .to(".hero-ui > :not(.hero-copy-wrap)", { opacity: 1, duration: 1, stagger: 0.08 }, 1.3);
  };
  // Заставка ждёт не шрифты, а картинку неба: она лёгкая и качается первой (preload в <head>), поэтому
  // на медленном интернете сцена открывается на 1–2 секунды раньше. Буквы PHỞ поднимаются, когда загрузится
  // их шрифт (не дольше 2.5 с), — иначе мелькнул бы запасной шрифт.
  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const skyReady = new Promise(resolve => {
    const m = /url\("?([^")]+)"?\)/.exec(getComputedStyle($(".sky")).backgroundImage || "");
    if (!m) return resolve();
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = m[1];
  });
  const sceneShown = Promise.race([skyReady, wait(1500)]).then(() => wait(150)).then(intro);
  Promise.all([sceneShown, Promise.race([ready, wait(2500)])])
    .then(() => gsap.to(letters, { y: 0, opacity: 1, duration: 1.6, stagger: 0.12, ease: "expo.out", delay: 0.5 }));

  /* ---------- Hero: прокрутка разворачивает сцену ---------- */
  const mm = gsap.matchMedia();
  mm.add({ desktop: "(min-width: 721px)", mobile: "(max-width: 720px)" }, ctx => {
    const { desktop } = ctx.conditions;
    // на телефоне слой фонарей короче экрана (styles.css) — сдвиг пересчитан под его высоту,
    // а сглаживание прокрутки короче, чтобы сцена шла за пальцем без запаздывания
    const short = touch && !desktop;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: "#heroTrack", start: "top top", end: () => "+=" + stickRun("#heroTrack", "#hero"), scrub: touch ? 0.35 : 1 }
    });
    tl.to(letters[0], { xPercent: desktop ? -70 : -40, rotation: -8, ease: "none", duration: 1 }, 0)
      .to(letters[2], { xPercent: desktop ? 70 : 40, rotation: 8, ease: "none", duration: 1 }, 0)
      .to(letters[1], { yPercent: -18, scale: 0.9, ease: "none", duration: 1 }, 0)
      .to(".giant-inner", { scale: desktop ? 1.18 : 1.05, ease: "none", duration: 1 }, 0)
      .to(".giant-inner", { opacity: 0, ease: "power1.in", duration: 0.4 }, 0)
      .fromTo(".hero-ui .chapter-label", { opacity: 1, y: 0 }, { opacity: 0, y: -20, ease: "none", duration: 0.2, immediateRender: false }, 0)
      // небо с луной уплывает вверх, город у реки приближается — камера будто летит над рекой
      .to(".sky", { yPercent: -4, ease: "none", duration: 1 }, 0)
      .to(".town", { yPercent: 5, scale: 1.12, ease: "none", duration: 1 }, 0)
      .to(".front", { yPercent: 12, scale: 1.15, ease: "none", duration: 1 }, 0) // кувшинки ближе всех — уходят вниз быстрее
      .to(".lanterns", { yPercent: short ? -60 : -18, ease: "none", duration: 1 }, 0)
      .fromTo(".scroll-hint", { opacity: 1 }, { opacity: 0, duration: 0.15, immediateRender: false }, 0)
      .fromTo("#heroCopy", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.4);
    return () => {};
  });

  /* ---------- Сборка чаши фо: лапша → говядина → зелень → бульон → подача ---------- */
  // Кадры одной чаши лежат друг на друге: на каждом шаге следующий проявляется поверх (меняется только прозрачность
  // готовой картинки). Продукты влетают в чашу, чаша вздрагивает. Последний кадр — настоящее фото Фо Бо,
  // на шаге «Подача» поверх него включается видео с паром, сделанное из этого же фото.
  if ($("#assemble")) {
    const shots = $$(".asm-s");
    const video = $(".asm-video");
    // Видео качаем, когда сборка рядом (при экономии трафика — не качаем, остаётся фото), играет только
    // на последнем шаге и только пока сборка на экране
    const saveData = navigator.connection && navigator.connection.saveData;
    let wantVideo = false, asmInView = false;
    const syncVideo = () => {
      if (!video || saveData) return;
      if (asmInView && !video.src) { video.src = video.dataset.src; video.load(); }
      if (wantVideo && asmInView) video.play().catch(() => {});
      else if (!video.paused) video.pause();
    };
    new IntersectionObserver(([e]) => { asmInView = e.isIntersecting; syncVideo(); }, { rootMargin: "50% 0px" }).observe($("#assemble"));

    mm.add({ desktop: "(min-width: 1101px)", mobile: "(max-width: 1100px)" }, ctx => {
      const { desktop } = ctx.conditions;
      const steps = $$(".asm-steps li");
      const bar = $("#asmBar");
      // доля таймлайна, с которой начинается каждый шаг (всего 13.6 «секунд»)
      const marks = [0, 3.5, 5.5, 7.7, 10.2].map(t => t / 13.6);
      let cur = -1;
      const setStep = p => {
        let idx = 0; marks.forEach((m, i) => { if (p >= m) idx = i; });
        // классы меняем только при смене шага, полоску двигаем трансформом — без пересчёта раскладки
        if (idx !== cur) {
          cur = idx;
          steps.forEach((li, i) => { li.classList.toggle("is-active", i === idx); li.classList.toggle("is-done", i < idx); });
          wantVideo = idx === 4; syncVideo();
        }
        if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
      };
      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: {
          trigger: "#assemble", start: "top top", end: () => "+=" + stickRun("#assemble", ".asm-sticky"),
          scrub: touch ? 0.35 : 1, onUpdate: self => setStep(self.progress)
        }
      });
      const BOTTOM = "50% 70%"; // дно чаши на кадре — от него чаша приседает и подпрыгивает
      // продукт появляется в стороне (data-x/y — сдвиг в процентах своего размера) и летит в чашу
      const fly = (sel, at) => {
        const el = $(sel); if (!el) return;
        tl.fromTo(el, { opacity: 0, scale: 0, xPercent: +el.dataset.x, yPercent: +el.dataset.y, rotation: 0 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" }, at)
          .to(el, { xPercent: 0, yPercent: 0, scale: 0.3, rotation: "+=120", opacity: 0, duration: 0.9, ease: "power2.in" }, at + 0.6);
      };
      const bump = at => tl
        .to(".asm-bowl", { scaleX: 1.035, scaleY: 0.965, transformOrigin: BOTTOM, duration: 0.12, ease: "power1.out" }, at)
        .to(".asm-bowl", { scaleX: 1, scaleY: 1, duration: 0.45, ease: "elastic.out(1, 0.35)" }, at + 0.12);
      const show = (i, at, duration = 0.6) => tl.fromTo(shots[i], { opacity: 0 }, { opacity: 1, duration, ease: "none" }, at);

      // вступление: пустая чаша падает сверху, вращаясь, отскакивает и встаёт по центру
      tl.fromTo(".asm-bowl", { yPercent: desktop ? -110 : -80 }, { yPercent: 0, duration: 1.4, ease: "bounce.out" }, 0)
        .fromTo(".asm-bowl", { opacity: desktop ? 1 : 0 }, { opacity: 1, duration: 0.35, ease: "none" }, 0)
        .fromTo(".asm-bowl", { rotation: -38, scale: 0.86, transformOrigin: BOTTOM }, { rotation: 0, scale: 1, duration: 1.6, ease: "elastic.out(1, 0.45)" }, 0)
        .fromTo(".asm-shadow", { scale: 0.12, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.4, ease: "bounce.out" }, 0);
      // 01 — лапша
      fly(".fly-noodle", 1.5); show(1, 2.2); bump(2.5);
      // 02 — говядина
      fly(".fly-beef", 3.5); fly(".fly-beef2", 3.7); fly(".fly-anise", 3.9); show(2, 4.3); bump(4.6);
      // 03 — зелень
      fly(".fly-cil", 5.5); fly(".fly-onion", 5.7); show(3, 6.2); bump(6.6);
      // 04 — бульон: кипящий бульон заваривает говядину — сырое мясо сменяется настоящим фото, поднимается пар
      show(4, 8.3, 1.3); bump(9.1);
      tl.fromTo(".asm-steam", { opacity: 0 }, { opacity: 1, duration: 0.8 }, 8.9);
      // 05 — подача: включается видео с паром, чаша чуть приближается
      tl.fromTo(".asm-video", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "none" }, 10.2)
        .to([".asm-bowl", ".asm-shadow"], { scale: 1.06, duration: 1.2, ease: "power2.inOut" }, 10.4)
        .to(".asm-scene", { scale: desktop ? 0.94 : 0.97, duration: 0.8, ease: "none" }, 12.2)
        .to({}, { duration: 0.6 }, 13.0);
      setStep(0);
      return () => {};
    });
  }

  /* ---------- Параллакс сцены за мышью ---------- */
  if (finePointer) {
    const layers = $$("#scene [data-depth]").map(el => ({ d: +el.dataset.depth, x: gsap.quickTo(el, "x", { duration: 1.2, ease: "power3.out" }), y: gsap.quickTo(el, "y", { duration: 1.2, ease: "power3.out" }) }));
    $("#hero").addEventListener("pointermove", e => {
      const nx = e.clientX / innerWidth - 0.5, ny = e.clientY / innerHeight - 0.5;
      layers.forEach(l => { l.x(-nx * 60 * l.d); l.y(-ny * 30 * l.d); });
    });
  }

  /* ---------- Главы: появление карточек (листаются стрелками) ---------- */
  gsap.fromTo(".panel", { opacity: 0, y: 60 }, { opacity: 1, y: 0, stagger: 0.1, duration: 1.1, ease: "expo.out", clearProps: "transform,opacity", scrollTrigger: { trigger: ".story", start: "top 75%" } });

  /* ---------- Бегущая строка ---------- */
  gsap.fromTo("#marquee1", { xPercent: 0 }, { xPercent: -35, ease: "none", scrollTrigger: { trigger: ".marquee", start: "top bottom", end: "bottom top", scrub: 0.6 } });
  gsap.fromTo("#marquee2", { xPercent: -35 }, { xPercent: 0, ease: "none", scrollTrigger: { trigger: ".marquee", start: "top bottom", end: "bottom top", scrub: 0.6 } });

  /* ---------- Заголовки и карточки ---------- */
  $$(".split").forEach(el => {
    gsap.from($$(".w > span", el), { yPercent: 115, rotation: 4, duration: 1.3, ease: "expo.out", stagger: 0.07, scrollTrigger: { trigger: el, start: "top 85%" } });
  });
  $$(".chapter-label").forEach(el => {
    if (el.closest(".hero-ui")) return;
    gsap.from(el, { opacity: 0, x: -30, duration: 1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%" } });
  });
  ScrollTrigger.batch(".card", {
    start: "top 92%",
    onEnter: els => gsap.fromTo(els, { opacity: 0, y: 60, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 1, ease: "expo.out", stagger: 0.06, overwrite: true, clearProps: "transform,opacity" }),
    once: true
  });
  // fromTo с явной конечной точкой + очистка: у карточек есть CSS-переход transform для hover, from() мог запомнить промежуточный сдвиг
  gsap.fromTo(".info-card", { opacity: 0, y: 50 }, { opacity: 1, y: 0, stagger: 0.1, duration: 1, ease: "expo.out", clearProps: "transform,opacity", scrollTrigger: { trigger: ".info-grid", start: "top 85%" } });
  gsap.from(".vertical-big", { yPercent: 30, opacity: 0, ease: "none", scrollTrigger: { trigger: ".finale", start: "top bottom", end: "center center", scrub: 1 } });
  gsap.fromTo(".footer-giant", { yPercent: 40 }, { yPercent: 0, ease: "none", scrollTrigger: { trigger: ".site-footer", start: "top bottom", end: "bottom bottom", scrub: 1 } });

  /* ---------- Финал: фонари зажигаются по одному ---------- */
  const fl = $$(".finale-lanterns span");
  ScrollTrigger.create({
    trigger: ".finale", start: "top 80%", end: "center 40%", scrub: true,
    onUpdate: self => { const n = Math.round(self.progress * fl.length); fl.forEach((s, i) => s.classList.toggle("lit", i < n)); }
  });

  /* ---------- Активная глава в навигации ---------- */
  const navLinks = $$(".chapter-nav a");
  ["#heroTrack", "#assemble", "#story", "#hits", "#delivery"].forEach((sel, i) => {
    if (!$(sel)) return;
    ScrollTrigger.create({ trigger: sel, start: "top center", end: "bottom center", onToggle: s => s.isActive && navLinks.forEach((a, j) => a.classList.toggle("is-active", i === j)) });
  });

  /* ---------- Наклон карточек и подсветка под курсором ---------- */
  if (finePointer) {
    document.addEventListener("pointermove", e => {
      const card = e.target.closest?.(".card");
      $$(".card.tilting").forEach(c => { if (c !== card) { c.classList.remove("tilting"); gsap.to(c, { rotationX: 0, rotationY: 0, duration: 0.6, ease: "power3.out" }); } });
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty("--mx", px * 100 + "%"); card.style.setProperty("--my", py * 100 + "%");
      card.classList.add("tilting");
      gsap.to(card, { rotationY: (px - 0.5) * 10, rotationX: -(py - 0.5) * 10, transformPerspective: 900, duration: 0.5, ease: "power3.out" });
    }, { passive: true });

    /* Магнитные кнопки */
    $$(".magnetic").forEach(btn => {
      const xTo = gsap.quickTo(btn, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
      const yTo = gsap.quickTo(btn, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
      btn.addEventListener("pointermove", e => { const r = btn.getBoundingClientRect(); xTo((e.clientX - r.left - r.width / 2) * 0.3); yTo((e.clientY - r.top - r.height / 2) * 0.4); });
      btn.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
    });

    /* Свечение за курсором */
    const glow = $("#cursorGlow");
    const gx = gsap.quickTo(glow, "x", { duration: 0.8, ease: "power3.out" });
    const gy = gsap.quickTo(glow, "y", { duration: 0.8, ease: "power3.out" });
    addEventListener("pointermove", e => { document.body.classList.add("has-pointer"); gx(e.clientX); gy(e.clientY); }, { passive: true });
  }

  /* ---------- Пересчёт при изменении высоты меню (поиск) и загрузке шрифтов ---------- */
  let rt;
  const refresh = () => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 200); };
  new ResizeObserver(refresh).observe(document.body);
  ready.then(refresh);
})();
