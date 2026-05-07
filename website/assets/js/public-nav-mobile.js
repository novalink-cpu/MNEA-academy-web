/**
 * Public site: mobile hamburger + accordion submenus (max-width: 768px).
 * Relies on #navToggle, #navMenu, and .nav-item-dropdown > a.nav-courses-trigger + ul.nav-dropdown.
 */
(function () {
  'use strict';
  var MQ = '(max-width: 768px)';
  var BACKDROP_ID = 'navMobileBackdrop';

  function mqMobile() {
    return window.matchMedia(MQ).matches;
  }

  function getOrCreateBackdrop() {
    var el = document.getElementById(BACKDROP_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BACKDROP_ID;
      el.className = 'nav-mobile-backdrop';
      el.setAttribute('aria-hidden', 'true');
      el.addEventListener('click', closeMenu);
      document.body.appendChild(el);
    }
    return el;
  }

  function closeMenu() {
    var navMenu = document.getElementById('navMenu');
    var navToggle = document.getElementById('navToggle');
    if (navMenu) {
      navMenu.classList.remove('open');
      closeAllSubnavs(navMenu);
    }
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-mobile-drawer-open');
    var bd = document.getElementById(BACKDROP_ID);
    if (bd) bd.classList.remove('is-visible');
  }

  function closeAllSubnavs(menu) {
    menu.querySelectorAll('.nav-item-dropdown.is-subnav-open').forEach(function (li) {
      li.classList.remove('is-subnav-open');
      var btn = li.querySelector('.nav-submenu-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      var tr = li.querySelector('.nav-courses-trigger');
      if (tr) tr.setAttribute('aria-expanded', 'false');
    });
  }

  function setSubnavOpen(li, open) {
    var menu = li.closest('#navMenu');
    if (!menu) return;
    if (open) {
      menu.querySelectorAll('.nav-item-dropdown.is-subnav-open').forEach(function (other) {
        if (other === li) return;
        other.classList.remove('is-subnav-open');
        var ob = other.querySelector('.nav-submenu-toggle');
        if (ob) ob.setAttribute('aria-expanded', 'false');
        var ot = other.querySelector('.nav-courses-trigger');
        if (ot) ot.setAttribute('aria-expanded', 'false');
      });
    }
    li.classList.toggle('is-subnav-open', open);
    var btn = li.querySelector('.nav-submenu-toggle');
    var tr = li.querySelector('.nav-courses-trigger');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (tr) tr.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function toggleSubnav(li) {
    setSubnavOpen(li, !li.classList.contains('is-subnav-open'));
  }

  function enhanceDropdownItem(li) {
    if (li.dataset.navAccordionInit === '1') return;
    var sub = li.querySelector(':scope > ul.nav-dropdown');
    var trigger = li.querySelector(':scope > a.nav-courses-trigger');
    if (!sub || !trigger) return;
    li.dataset.navAccordionInit = '1';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-submenu-toggle';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Toggle submenu');
    var sid = sub.id;
    if (!sid) {
      sid = 'nav-sub-' + Math.random().toString(36).slice(2, 11);
      sub.id = sid;
    }
    btn.setAttribute('aria-controls', sid);

    trigger.insertAdjacentElement('afterend', btn);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!mqMobile()) return;
      toggleSubnav(li);
    });

    trigger.addEventListener('click', function (e) {
      if (!mqMobile()) return;
      if (!li.classList.contains('is-subnav-open')) {
        e.preventDefault();
        setSubnavOpen(li, true);
      }
    });
  }

  function initAccordions() {
    document.querySelectorAll('#navMenu .nav-item-dropdown').forEach(enhanceDropdownItem);
  }

  function bindNavToggle() {
    var navToggle = document.getElementById('navToggle');
    var navMenu = document.getElementById('navMenu');
    if (!navToggle || !navMenu) return;
    navToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (navMenu.classList.contains('open')) return;
      navMenu.classList.add('open');
      navToggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('nav-mobile-drawer-open');
      getOrCreateBackdrop().classList.add('is-visible');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) closeMenu();
    });
  }

  function onResize() {
    if (mqMobile()) return;
    var navMenu = document.getElementById('navMenu');
    if (navMenu) {
      navMenu.classList.remove('open');
      closeAllSubnavs(navMenu);
    }
    var navToggle = document.getElementById('navToggle');
    if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-mobile-drawer-open');
    var bd = document.getElementById(BACKDROP_ID);
    if (bd) bd.classList.remove('is-visible');
  }

  function boot() {
    initAccordions();
    bindNavToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('resize', onResize);
})();
