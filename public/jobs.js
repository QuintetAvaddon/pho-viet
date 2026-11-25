/* Заявка на работу: проверка полей и отправка на сервер (POST /api/job → Telegram ресторана) */
(() => {
  "use strict";
  const { CFG, LOCS, $, esc, phoneMask } = window.PV_UTIL;
  const form = $("#jobForm");
  const POSITIONS = (CFG.jobs && CFG.jobs.positions) || [];

  // Одна вакансия — показываем её как готовое поле, без выпадающего списка
  if (POSITIONS.length === 1) {
    const fixed = document.createElement("input");
    fixed.id = "jPosition"; fixed.name = "position"; fixed.value = POSITIONS[0]; fixed.readOnly = true;
    $("#jPosition").replaceWith(fixed);
  } else {
    $("#jPosition").innerHTML = `<option value="">Выберите</option>` + POSITIONS.map(p => `<option>${esc(p)}</option>`).join("");
  }
  const open = POSITIONS.filter(p => p !== "Другое").map(p => p.toLowerCase());
  if (open.length) $("#jVacancies").textContent = (open.length === 1 ? "Открыта вакансия: " : "Открытые вакансии: ") + open.join(", ") + ".";
  $("#jPoint").innerHTML = `<option value="">Выберите ресторан</option>` +
    LOCS.map(l => `<option value="${esc(l.id)}">${esc(l.name || l.id)} — ${esc(l.address || "")}</option>`).join("");

  phoneMask($("#jPhone")); // +7 (XXX) XXX-XX-XX — как в оформлении заказа
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
