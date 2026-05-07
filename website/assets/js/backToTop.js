(function() {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__academyBackToTopInitialized) return;
  window.__academyBackToTopInitialized = true;

  var STYLE_ID = 'academy-back-to-top-style';
  var BUTTON_ID = 'academyBackToTopBtn';
  var SHOW_CLASS = 'is-visible';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.academy-back-to-top{' +
      'position:fixed!important;left:auto!important;right:max(24px,env(safe-area-inset-right,0px))!important;' +
      'bottom:max(24px,env(safe-area-inset-bottom,0px))!important;' +
      'width:50px!important;height:50px!important;margin:0!important;padding:0!important;box-sizing:border-box!important;' +
      'border:none;border-radius:50%;' +
      'background:rgba(255,255,255,.96);color:#d62828;display:inline-flex;align-items:center;justify-content:center;' +
      'cursor:pointer;opacity:0;visibility:hidden;transform:translate3d(0,8px,0);pointer-events:none;' +
      'box-shadow:0 2px 14px rgba(0,0,0,.1);' +
      'transition:opacity .2s ease,transform .2s ease,box-shadow .2s ease,background .2s ease,color .2s ease;z-index:99999;' +
      '}' +
      '.academy-back-to-top svg{display:block;width:100%;height:100%;padding:4px;box-sizing:border-box;}' +
      '.academy-back-to-top.' + SHOW_CLASS + '{opacity:1;visibility:visible;transform:translate3d(0,0,0);pointer-events:auto;}' +
      '.academy-back-to-top:hover{background:#d62828;color:#fff;box-shadow:0 4px 18px rgba(214,40,40,.45);}';
    document.head.appendChild(style);
  }

  function createButton() {
    var btn = document.getElementById(BUTTON_ID);
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BUTTON_ID;
    btn.className = 'academy-back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
      '<circle cx="24" cy="24" r="21" stroke="currentColor" stroke-width="1.75"/>' +
      '<path stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M17 32l7-6 7 6"/>' +
      '<path stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M17 26l7-6 7 6"/>' +
      '<path stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M17 20l7-6 7 6"/>' +
      '</svg>';
    document.body.appendChild(btn);
    return btn;
  }

  function setup() {
    ensureStyle();
    var button = createButton();
    var onScroll = function() {
      var y = window.scrollY || window.pageYOffset || 0;
      if (y >= 300) button.classList.add(SHOW_CLASS);
      else button.classList.remove(SHOW_CLASS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    button.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
