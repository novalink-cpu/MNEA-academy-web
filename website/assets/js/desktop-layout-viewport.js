/**
 * Optional wide-layout viewport (NOT used by default PWA).
 * Only when the current URL contains ?desktop=1 — no localStorage (normal installs stay mobile-friendly).
 * ?mobile=1 clears legacy mmneaDesktopLayout if present.
 */
(function () {
  try {
    try {
      localStorage.removeItem('mmneaDesktopLayout');
    } catch (e) {}
    var q = typeof location !== 'undefined' ? location.search : '';
    if (!/[?&]desktop=1(?:&|$)/.test(q)) return;
    if (typeof document === 'undefined') return;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    var w =
      (document.documentElement && document.documentElement.clientWidth) ||
      (typeof window.screen !== 'undefined' && window.screen.width) ||
      390;
    var scale = Math.min(1, Math.max(0.44, (w / 1280) * 1.18));
    scale = Math.round(scale * 1000) / 1000;
    meta.setAttribute(
      'content',
      'width=1280, initial-scale=' +
        scale +
        ', minimum-scale=0.35, maximum-scale=5, user-scalable=yes, viewport-fit=cover'
    );
  } catch (e) {}
})();
