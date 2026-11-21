/* Заявка на работу: проверка полей и отправка на сервер (POST /api/job → Telegram ресторана) */
(() => {
  "use strict";
  const CFG = window.SITE_CONFIG || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const form = $("#jobForm");
  const LOCS = Array.isArray(CFG.locations) ? CFG.locations : [];
  const POSITIONS = (CFG.jobs && CFG.jobs.positions) || [];

  $("#jPosition").innerHTML = `<option value="">Выберите</option>` + POSITIONS.map(p => `<option>${esc(p)}</option>`).join("");
  $("#jPoint").innerHTML = `<option value="">Выберите ресторан</option>` +
    LOCS.map(l => `<option value="${esc(l.id)}">${esc(l.name || l.id)} — ${esc(l.address || "")}</option>`).join("");

  // Маска телефона +7 (XXX) XXX-XX-XX — как в оформлении заказа
  $("#jPhone").addEventListener("input", e => {
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
  $("#jAge").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 2); });

  const rules = {
    jName: v => v.trim().length >= 2 || "Укажите имя",
    jPhone: v => v.replace(/\D/g, "").length === 11 || "Введите телефон полностью: +7 и 10 цифр",
    jPosition: v => !!v || "Выберите должность",
    jAge: v => !v.trim() || (+v >= 14 && +v <= 75) || "Укажите возраст цифрами",
    jPoint: v => !!v || "Выберите ресторан"
  };
  const validate = id => {
    const el = $("#" + id), res = rules[id](el.value), msg = res === true ? "" : res;
    $(`#${id}-err`).textContent = msg;
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  };
  Object.keys(rules).forEach(id => $("#" + id).addEventListener("blur", () => { if ($("#" + id).value) validate(id); }));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const bad = Object.keys(rules).filter(id => !validate(id));
    const consent = $("#jConsent").checked;
    $("#jConsent-err").textContent = consent ? "" : "Нужно согласие, чтобы мы могли рассмотреть заявку";
    if (bad.length) { $("#" + bad[0]).focus(); return; }
    if (!consent) { $("#jConsent").focus(); return; }

    const fd = Object.fromEntries(new FormData(form));
    const btn = $("#jSubmit"), errEl = $("#jSubmitErr");
    errEl.textContent = "";
    btn.disabled = true; btn.textContent = "Отправляем…";
    try {
      const r = await fetch("/api/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fd.name.trim(), phone: fd.phone, position: fd.position, age: fd.age, point: fd.point, about: fd.about || "", consent: true })
      });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || !res.ok) throw new Error(res.error || "Не удалось отправить заявку");
      const loc = LOCS.find(l => l.id === fd.point);
      form.hidden = true;
      $("#jobSuccess").hidden = false;
      $("#jobSuccessText").textContent = `Спасибо, ${fd.name.trim()}! Менеджер ресторана ${loc ? loc.name : ""} позвонит вам на ${fd.phone}.`;
      $("#jobSuccessTitle").focus();
    } catch (err) {
      errEl.textContent = `${err.message}. Попробуйте ещё раз или позвоните нам: ${CFG.phone || ""}`;
    } finally {
      btn.disabled = false; btn.textContent = "Отправить заявку";
    }
  });
})();
