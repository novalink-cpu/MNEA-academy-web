(function () {
  'use strict';

  var sidebar = document.querySelector('.dashboard-sidebar');
  var header = document.querySelector('.dashboard-header');
  if (!sidebar || !header) return;

  if (!sidebar.id) sidebar.id = 'dashboard-sidebar-panel';

  /** Real phones / tablets with touch — not narrow desktop windows without touch. */
  function isPhoneSidebarMode() {
    var touchLike =
      (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0) ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
    if (!touchLike) return false;
    if (window.matchMedia('(max-width: 768px)').matches) return true;
    /* Wide layout viewport (e.g. ?desktop=1) on a small physical screen */
    if (
      window.matchMedia('(max-device-width: 900px)').matches &&
      window.matchMedia('(min-width: 769px)').matches
    ) {
      return true;
    }
    return false;
  }

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dashboard-sidebar-toggle';
  btn.setAttribute('aria-controls', sidebar.id);
  btn.setAttribute('aria-label', 'Open menu');

  var backdrop = document.createElement('div');
  backdrop.className = 'dashboard-sidebar-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  var wrap = sidebar.closest('.dashboard-wrap');
  if (wrap) {
    wrap.insertBefore(backdrop, sidebar.nextSibling);
  } else if (sidebar.parentNode) {
    sidebar.parentNode.insertBefore(backdrop, sidebar.nextSibling);
  } else {
    document.body.appendChild(backdrop);
  }

  header.insertBefore(btn, header.firstChild);

  function clearScrollLock() {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.documentElement.style.touchAction = '';
  }

  function setDrawerOpen(open) {
    if (!isPhoneSidebarMode()) return;
    document.body.classList.toggle('dashboard-sidebar-open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    btn.innerHTML = open ? '\u2715' : '\u2630';
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
    clearScrollLock();
    if (open) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      document.documentElement.style.touchAction = 'none';
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function syncPhoneMode() {
    var phone = isPhoneSidebarMode();
    document.body.classList.toggle('dashboard-sidebar-phone-mode', phone);
    if (!phone) {
      document.body.classList.remove('dashboard-sidebar-open');
      backdrop.setAttribute('aria-hidden', 'true');
      clearScrollLock();
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
      btn.innerHTML = '\u2630';
    } else {
      var open = document.body.classList.contains('dashboard-sidebar-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      btn.innerHTML = open ? '\u2715' : '\u2630';
      if (open) {
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        document.documentElement.style.touchAction = 'none';
      }
    }
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (!isPhoneSidebarMode()) return;
    setDrawerOpen(!document.body.classList.contains('dashboard-sidebar-open'));
  });

  backdrop.addEventListener('click', closeDrawer);

  sidebar.addEventListener('click', function (e) {
    if (isPhoneSidebarMode() && e.target.closest('a')) closeDrawer();
  });

  document.addEventListener('keydown', function (e) {
    if (
      e.key === 'Escape' &&
      isPhoneSidebarMode() &&
      document.body.classList.contains('dashboard-sidebar-open')
    ) {
      closeDrawer();
    }
  });

  function bindMq(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  bindMq(window.matchMedia('(max-width: 768px)'), syncPhoneMode);
  bindMq(window.matchMedia('(min-width: 769px)'), syncPhoneMode);
  bindMq(window.matchMedia('(max-device-width: 900px)'), syncPhoneMode);
  window.addEventListener('orientationchange', syncPhoneMode);
  window.addEventListener('resize', syncPhoneMode);

  syncPhoneMode();
})();
