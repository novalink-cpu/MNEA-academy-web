(function() {
  'use strict';
  function tryNextFallback(img, placeholderClass) {
    img.style.display = 'none';
    var list = (img.getAttribute('data-fallbacks') || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    var tried = (img.dataset.fallbackIndex || 0) | 0;
    if (tried < list.length) {
      img.dataset.fallbackIndex = tried + 1;
      img.style.display = 'block';
      img.src = list[tried];
      return true;
    }
    var pl = img.nextElementSibling;
    if (pl && pl.classList.contains(placeholderClass)) pl.style.display = 'flex';
    return false;
  }
  document.querySelectorAll('.blog-article-feature__img').forEach(function(img) {
    img.addEventListener('load', function() { this.style.display = 'block'; });
    img.addEventListener('error', function() { tryNextFallback(this, 'blog-article-feature__placeholder'); });
  });
})();
