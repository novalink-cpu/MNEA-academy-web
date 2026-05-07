(function () {
  if (!('serviceWorker' in navigator)) return;

  function directoryScope() {
    var path = window.location.pathname || '/';
    if (path.endsWith('/')) return path;
    var i = path.lastIndexOf('/');
    return i >= 0 ? path.slice(0, i + 1) : '/';
  }

  window.addEventListener('load', function () {
    var scope = directoryScope();
    navigator.serviceWorker
      .register(scope + 'sw.js', { scope: scope })
      .catch(function () {});
  });
})();
