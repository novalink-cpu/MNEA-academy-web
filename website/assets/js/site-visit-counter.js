(function () {
  'use strict';

  var DEVICE_KEY = 'mnea_visit_counted';

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function ensureWidget() {
    var right = document.querySelector('.top-bar-right');
    if (!right) return null;

    var el = document.getElementById('topBarVisitCounter');
    if (!el) {
      el = document.createElement('span');
      el.id = 'topBarVisitCounter';
      el.className = 'top-bar-visit-counter';
      el.setAttribute('aria-label', 'Today page views');
      el.innerHTML =
        '<span class="top-bar-visit-dot" aria-hidden="true"></span>' +
        '<span class="top-bar-visit-label">Today</span> ' +
        '<strong class="top-bar-visit-num">—</strong>';

      var firstSocial = right.querySelector('.social-icon');
      if (firstSocial) {
        right.insertBefore(el, firstSocial);
      } else {
        right.insertBefore(el, right.firstChild);
      }
    }
    return el;
  }

  function setCount(n) {
    var el = ensureWidget();
    if (!el) return;
    var num = el.querySelector('.top-bar-visit-num');
    if (num) num.textContent = n >= 0 ? String(n) : '—';
  }

  function fetchToday() {
    return fetch('/api/site/visits/today', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) setCount(data.today);
      })
      .catch(function () {});
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function recordHit() {
    var key = DEVICE_KEY + '_' + todayKey();
    if (storageGet(key)) return fetchToday();

    return fetch('/api/site/visits/hit', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          storageSet(key, '1');
          setCount(data.today);
        }
      })
      .catch(function () { return fetchToday(); });
  }

  function init() {
    ensureWidget();
    recordHit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
