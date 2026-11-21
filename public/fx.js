/* Визуальные эффекты: сцена, параллакс, частицы, плавный скролл.
   Логика заказа живёт в app.js и от этого файла не зависит. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const isMobile = () => innerWidth <= 720;
  // Режимы: full — компьютер с мышью; touch — телефоны и планшеты (без тяжёлых эффектов);
  // lite — Android и слабые устройства (ещё легче: сборка фо без закрепления). Проверка: ?fx=full|touch|lite
  const q = new URLSearchParams(location.search).get("fx");
  const forced = ["full", "touch", "lite"].includes(q) ? q : null;
  const touch = forced ? forced !== "full" : !finePointer;
  const weak = /Android/i.test(navigator.userAgent) || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
  const lite = forced ? forced === "lite" : touch && weak;
  root.classList.add(touch ? "fx-touch" : "fx-full");
  if (lite) root.classList.add("fx-lite");
  // телефон (сенсорный экран до 720px): первый экран без закрепления и разворота сцены
  const staticHero = touch && matchMedia("(max-width: 720px)").matches;

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

  /* ---------- Звёзды ---------- */
  // На телефонах звёзды рисуются один раз: постоянная перерисовка холста на весь экран — главный пожиратель кадров
  function stars() {
    const c = $("#stars"); if (!c) return;
    const ctx = c.getContext("2d");
    const still = touch || reduced;
    let w = 0, h = 0, list = [];
    const paint = t => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#fff4e8";
      for (const s of list) {
        const a = still ? 0.7 : 0.35 + 0.65 * Math.abs(Math.sin(s.p + t * 0.001 * s.s));
        ctx.globalAlpha = a * (1 - s.y / (h * 0.75));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    };
    const resize = () => {
      const nw = c.clientWidth, nh = c.clientHeight;
      // на телефоне высота окна прыгает от адресной строки — из-за этого звёзды не пересоздаём
      if (still && w && Math.abs(nw - w) < 1 && Math.abs(nh - h) < 160) return;
      const dpr = Math.min(devicePixelRatio || 1, touch ? 1.5 : 2);
      w = nw; h = nh; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      list = Array.from({ length: Math.round((w * h) / 4500) }, () => ({ x: Math.random() * w, y: Math.random() * h * 0.7, r: Math.random() * 1.2 + 0.2, p: Math.random() * Math.PI * 2, s: 0.5 + Math.random() * 1.5 }));
      if (still) paint(0);
    };
    let rt; resize(); addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
    if (still) return;
    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(c);
    const draw = t => { if (visible) paint(t); requestAnimationFrame(draw); };
    requestAnimationFrame(draw);
  }

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

  stars();
  particles();

  // Без GSAP или при reduced motion — показываем статичную версию
  if (reduced || !window.gsap || !window.ScrollTrigger) {
    root.classList.add("no-fx");
    hideLoader();
    return;
  }

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

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
  gsap.set(".moon", { scale: 0.6, opacity: 0 });
  if (!lite) gsap.set([".karst-far", ".karst-near", ".town", ".front"], { opacity: 0 }); // на слабых фон виден сразу
  gsap.set(".lantern", { y: -200 });
  gsap.set(".hero-ui > :not(.hero-copy)", { opacity: 0 });
  if (staticHero) gsap.set("#heroCopy", { opacity: 0, y: 30 });

  const intro = () => {
    hideLoader();
    // на телефоне слои сцены отдаются видеокарте только на время интро, потом освобождаем память
    if (touch) root.classList.add("intro-running");
    const tl = gsap.timeline({ defaults: { ease: "expo.out" }, onComplete: () => root.classList.remove("intro-running") });
    tl.to(".moon", { scale: 1, opacity: 1, duration: lite ? 1.4 : 2.2 }, 0.1);
    if (!lite) {
      tl.to(".karst-far", { opacity: 1, duration: 1.6 }, 0.3)
        .to(".karst-near", { opacity: 1, duration: 1.6 }, 0.45)
        .to(".town", { opacity: 1, duration: 1.6 }, 0.6)
        .to(".front", { opacity: 1, duration: 1.4 }, 0.9);
    }
    tl.to(letters, { y: 0, opacity: 1, duration: lite ? 1.1 : 1.6, stagger: 0.12 }, lite ? 0.3 : 0.7)
      .to(".lantern", { y: 0, duration: lite ? 1.2 : 2, ease: lite ? "power3.out" : "elastic.out(1, 0.5)", stagger: 0.12 }, lite ? 0.5 : 1)
      .to(".hero-ui > :not(.hero-copy)", { opacity: 1, duration: 1, stagger: 0.08 }, lite ? 0.8 : 1.3);
    // на телефоне первый экран не закреплён: текст и кнопка «Открыть меню» появляются сразу после интро
    if (staticHero) tl.to("#heroCopy", { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" }, lite ? 1.1 : 1.6);
  };
  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.race([ready, new Promise(r => setTimeout(r, 2500))]).then(() => setTimeout(intro, 350));

  /* ---------- Hero: прокрутка разворачивает сцену ---------- */
  const mm = gsap.matchMedia();
  // На телефонах первый экран обычный: прокрутка не двигает 9 полноэкранных слоёв — это и тормозило
  if (!staticHero) mm.add({ desktop: "(min-width: 721px)", mobile: "(max-width: 720px)" }, ctx => {
    const { desktop } = ctx.conditions;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: "#hero", start: "top top", end: desktop ? "+=150%" : "+=90%", scrub: 1, pin: true, anticipatePin: 1 }
    });
    tl.to(letters[0], { xPercent: desktop ? -70 : -40, rotation: -8, ease: "none", duration: 1 }, 0)
      .to(letters[2], { xPercent: desktop ? 70 : 40, rotation: 8, ease: "none", duration: 1 }, 0)
      .to(letters[1], { yPercent: -18, scale: 0.9, ease: "none", duration: 1 }, 0)
      .to(".giant-inner", { scale: desktop ? 1.18 : 1.05, ease: "none", duration: 1 }, 0)
      .to(".giant-inner", { opacity: 0, ease: "power1.in", duration: 0.4 }, 0)
      .fromTo(".hero-ui .chapter-label", { opacity: 1, y: 0 }, { opacity: 0, y: -20, ease: "none", duration: 0.2, immediateRender: false }, 0)
      .to(".moon-wrap", { yPercent: -10, scale: 1.25, ease: "none", duration: 1 }, 0)
      .to(".karst-far", { yPercent: -3, ease: "none", duration: 1 }, 0)
      .to(".karst-near", { yPercent: -6, ease: "none", duration: 1 }, 0)
      .to(".town", { yPercent: -9, ease: "none", duration: 1 }, 0)
      .to(".front", { yPercent: 8, scale: 1.12, ease: "none", duration: 1 }, 0)
      .to(".lanterns", { yPercent: -18, ease: "none", duration: 1 }, 0)
      .fromTo(".scroll-hint", { opacity: 1 }, { opacity: 0, duration: 0.15, immediateRender: false }, 0)
      .fromTo("#heroCopy", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0.4);
    return () => {};
  });

  /* ---------- Сборка чаши фо: лапша → говядина → зелень → бульон → поднос ---------- */
  if ($("#assemble")) {
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
        if (idx !== cur) { cur = idx; steps.forEach((li, i) => { li.classList.toggle("is-active", i === idx); li.classList.toggle("is-done", i < idx); }); }
        if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
      };
      const BOWL = { x: 450, y: 300 };
      // Компьютер и iPhone: сборка идёт по прокрутке (секция закреплена).
      // Android и слабые: без закрепления — сборка проигрывается сама, когда секция появляется на экране.
      const tl = gsap.timeline(lite
        ? { paused: true, defaults: { ease: "power2.out" }, onUpdate() { setStep(this.progress()); } }
        : {
            defaults: { ease: "power2.out" },
            scrollTrigger: {
              trigger: "#assemble", start: "top top", end: desktop ? "+=420%" : "+=240%",
              scrub: touch ? 0.5 : 1, pin: true, anticipatePin: 1, onUpdate: self => setStep(self.progress)
            }
          });
      const fly = (sel, at) => {
        tl.fromTo(sel, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" }, at)
          .to(sel, { x: BOWL.x, y: BOWL.y, scale: 0.25, rotation: "+=120", opacity: 0, duration: 0.9, ease: "power2.in" }, at + 0.6);
      };
      const bump = at => tl
        .to("#asmBowl", { scaleX: 1.035, scaleY: 0.965, transformOrigin: "50% 100%", duration: 0.12, ease: "power1.out" }, at)
        .to("#asmBowl", { scaleX: 1, scaleY: 1, duration: 0.45, ease: "elastic.out(1, 0.35)" }, at + 0.12);
      const pour = $(".asm-pour");
      const pourLen = pour ? pour.getTotalLength() : 200;

      // вступление: пустая чаша падает сверху, вращаясь, отскакивает и встаёт по центру
      tl.fromTo("#asmBowl", { y: desktop ? -820 : -420 }, { y: 0, duration: 1.4, ease: "bounce.out" }, 0)
        .fromTo("#asmBowl", { opacity: desktop ? 1 : 0 }, { opacity: 1, duration: 0.35, ease: "none" }, 0)
        .fromTo("#asmBowl", { rotation: -38, scale: 0.86, transformOrigin: "50% 100%" }, { rotation: 0, scale: 1, duration: 1.6, ease: "elastic.out(1, 0.45)" }, 0)
        .fromTo(".asm-ground-shadow", { scale: 0.12, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, opacity: 0.5, duration: 1.4, ease: "bounce.out" }, 0)
        .from(".asm-broth-top", { opacity: 0, duration: 0.01 }, 0);
      // 01 — лапша
      fly(".fly-noodle", 1.5);
      tl.from(".asm-noodles path", { y: -70, opacity: 0, duration: 1, stagger: 0.015 }, 2.2);
      bump(2.5);
      // 02 — говядина
      fly(".fly-beef", 3.5); fly(".fly-beef2", 3.7); fly(".fly-anise", 3.9);
      bump(4.6);
      tl.from(".asm-beef use", { y: -160, x: i => (i % 2 ? 120 : -120), rotation: i => (i % 2 ? 40 : -40), opacity: 0, duration: 1.1, stagger: 0.12, ease: "power3.out" }, 4.2);
      // 03 — зелень
      fly(".fly-basil", 5.5); fly(".fly-chili", 5.6); fly(".fly-cil", 5.8);
      bump(6.6);
      tl.from(".asm-greens > *", { y: -110, scale: 0, rotation: () => gsap.utils.random(-180, 180), opacity: 0, duration: 1, stagger: 0.025, ease: "back.out(1.4)" }, 6.2);
      // 04 — бульон: половник наливает кипящий бульон, он заваривает говядину, идёт пар
      tl.from(".asm-broth", { scaleY: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.8 }, 8.9)
        .from(".asm-steam", { opacity: 0, duration: 0.8 }, 9.1);
      tl.fromTo(".asm-ladle", { opacity: 0, x: 220, y: -180 }, { opacity: 1, x: 0, y: 0, duration: 0.8, ease: "power3.out" }, 7.7)
        .to(".asm-ladle > g", { rotation: -35, svgOrigin: "560 120", duration: 0.5, ease: "power2.inOut" }, 8.5)
        .fromTo(pour, { opacity: 0, strokeDasharray: pourLen, strokeDashoffset: pourLen }, { opacity: 0.95, strokeDashoffset: 0, duration: 0.45, ease: "power1.in" }, 8.8)
        .to(".asm-ladle > g", { rotation: -55, svgOrigin: "560 120", duration: 0.9, ease: "none" }, 9.0)
        .fromTo(".asm-splash circle", { opacity: 0, scale: 0, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, y: -14, duration: 0.3, stagger: 0.05 }, 9.1)
        .to(".asm-splash", { opacity: 0, duration: 0.25 }, 9.75)
        .set(".asm-splash", { opacity: 1 }, 9.1)
        .to(".asm-broth-top", { opacity: 1, duration: 0.01 }, 9.05)
        .from(".asm-broth-top ellipse, .asm-broth-top circle", { opacity: 0, scaleY: 0.3, transformOrigin: "50% 100%", duration: 0.8, stagger: 0.04 }, 9.05)
        .to(".asm-steam", { scale: 1.35, transformOrigin: "50% 100%", duration: 0.8 }, 9.2)
        .to(pour, { strokeDashoffset: -pourLen, duration: 0.4, ease: "power1.in" }, 9.8)
        .to(pour, { opacity: 0, duration: 0.05 }, 10.2)
        .to(".asm-ladle > g", { rotation: 0, svgOrigin: "560 120", duration: 0.4 }, 9.9)
        .to(".asm-ladle", { opacity: 0, x: 220, y: -180, duration: 0.6, ease: "power2.in" }, 10.1)
        .to(".asm-steam", { scale: 1, duration: 0.8 }, 10.4);
      bump(9.1);
      // 05 — подача на бамбуковом подносе
      tl.from("#asmTray", { y: 340, opacity: 0, duration: 1.3, ease: "power3.out" }, 10.2)
        .to("#asmBowl", { y: 14, duration: 0.6, ease: "power2.inOut" }, 11.1)
        .to(".asm-ground-shadow", { y: 14, duration: 0.6, ease: "power2.inOut" }, 11.1)
        .from(".asm-garnish > *", { y: 40, opacity: 0, scale: 0.6, transformOrigin: "50% 100%", duration: 0.7, stagger: 0.04, ease: "back.out(1.6)" }, 10.9)
        .from(".asm-side > :not(.asm-garnish)", { y: 50, opacity: 0, duration: 0.8, stagger: 0.08 }, 11.0)
        .to(".asm-scene", { scale: desktop ? 0.94 : 0.97, duration: 0.8, ease: "none" }, 12.2)
        .to({}, { duration: 0.6 }, 13.0);
      setStep(0);
      if (lite) ScrollTrigger.create({ trigger: "#assemble", start: "top 60%", once: true, onEnter: () => tl.timeScale(2).play() });
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
  if (!lite) {
    gsap.fromTo("#marquee1", { xPercent: 0 }, { xPercent: -35, ease: "none", scrollTrigger: { trigger: ".marquee", start: "top bottom", end: "bottom top", scrub: 0.6 } });
    gsap.fromTo("#marquee2", { xPercent: -35 }, { xPercent: 0, ease: "none", scrollTrigger: { trigger: ".marquee", start: "top bottom", end: "bottom top", scrub: 0.6 } });
  }

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
  if (!touch) {
    gsap.from(".vertical-big", { yPercent: 30, opacity: 0, ease: "none", scrollTrigger: { trigger: ".finale", start: "top bottom", end: "center center", scrub: 1 } });
    gsap.fromTo(".footer-giant", { yPercent: 40 }, { yPercent: 0, ease: "none", scrollTrigger: { trigger: ".site-footer", start: "top bottom", end: "bottom bottom", scrub: 1 } });
  }

  /* ---------- Финал: фонари зажигаются по одному ---------- */
  const fl = $$(".finale-lanterns span");
  ScrollTrigger.create({
    trigger: ".finale", start: "top 80%", end: "center 40%", scrub: true,
    onUpdate: self => { const n = Math.round(self.progress * fl.length); fl.forEach((s, i) => s.classList.toggle("lit", i < n)); }
  });

  /* ---------- Активная глава в навигации ---------- */
  const navLinks = $$(".chapter-nav a");
  ["#hero", "#assemble", "#story", "#hits", "#delivery"].forEach((sel, i) => {
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
