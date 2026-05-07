/**
 * Password strength meter, show/hide password toggles, clipboard copy for admin reset.
 * Expects: inputs with [data-password-meter], [data-toggle-pw], buttons [data-copy-target]
 */
(function () {
  "use strict";

  const SPECIAL = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/;
  const UPPER = /[A-Z]/;
  const LOWER = /[a-z]/;
  const DIGIT = /\d/;

  function scorePassword(pw) {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s += 25;
    if (pw.length >= 12) s += 10;
    if (UPPER.test(pw)) s += 15;
    if (LOWER.test(pw)) s += 15;
    if (DIGIT.test(pw)) s += 15;
    if (SPECIAL.test(pw)) s += 20;
    return Math.min(100, s);
  }

  function bindStrengthMeter(input, bar) {
    if (!input || !bar) return;
    const fill = bar.querySelector("i") || bar;
    input.addEventListener("input", function () {
      const sc = scorePassword(input.value);
      fill.style.width = sc + "%";
      fill.classList.remove("strength-weak", "strength-mid", "strength-strong");
      if (sc < 45) fill.classList.add("strength-weak");
      else if (sc < 75) fill.classList.add("strength-mid");
      else fill.classList.add("strength-strong");
    });
  }

  document.querySelectorAll("[data-password-meter]").forEach(function (input) {
    const id = input.getAttribute("data-password-meter");
    const bar = document.getElementById(id);
    bindStrengthMeter(input, bar);
  });

  document.querySelectorAll("[data-toggle-pw]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const sel = btn.getAttribute("data-toggle-pw");
      const inp = document.querySelector(sel);
      if (!inp) return;
      inp.type = inp.type === "password" ? "text" : "password";
      btn.setAttribute("aria-pressed", inp.type === "text" ? "true" : "false");
    });
  });

  window.copyToClipboard = function (text, statusEl) {
    if (!text) return;
    function ok() {
      if (statusEl) {
        statusEl.textContent = "Copied.";
        setTimeout(function () { statusEl.textContent = ""; }, 2500);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(function () {
        fallbackCopy(text, ok);
      });
    } else {
      fallbackCopy(text, ok);
    }
  };

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {}
    document.body.removeChild(ta);
    if (done) done();
  }
})();
