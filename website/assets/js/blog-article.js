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

  function basename(path) {
    var p = String(path || '').split('?')[0].split('#')[0];
    var bits = p.split('/');
    return bits[bits.length - 1] || '';
  }
  function escHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function formatDate(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  function categoryDisplayLabel(cat) {
    var c = String(cat || '').toLowerCase();
    if (c === 'learning-tips') return 'Learning Tips';
    if (c === 'study-guides') return 'Study Guides';
    if (c === 'academy-news') return 'Academy News';
    return cat ? String(cat) : '';
  }
  function normalizeBlogPostBody(body, excerpt) {
    var b = String(body || '').replace(/\r/g, '').trim();
    var ex = String(excerpt || '').trim();
    if (!b || !ex) return b;
    var lines = b.split('\n');
    while (lines.length && String(lines[0] || '').trim() === ex) lines.shift();
    while (lines.length && !String(lines[0] || '').trim()) lines.shift();
    return lines.join('\n').trim();
  }
  function buildBodyHtml(rawBody) {
    var text = String(rawBody || '').replace(/\r/g, '').trim();
    if (!text) return '';
    var lines = text.split('\n');
    var out = [];
    var para = [];
    function flushPara() {
      if (!para.length) return;
      out.push('<p>' + para.join(' ') + '</p>');
      para = [];
    }
    lines.forEach(function(line) {
      var s = String(line || '').trim();
      if (!s) { flushPara(); return; }
      if (s.indexOf('## ') === 0) {
        flushPara();
        out.push('<h3>' + escHtml(s.slice(3)) + '</h3>');
        return;
      }
      para.push(escHtml(s));
    });
    flushPara();
    return out.join('');
  }
  function renderFromCmsPost(post) {
    if (!post) return;
    var h1 = document.querySelector('.page-head__title-text h1');
    if (h1 && post.title) h1.textContent = post.title;
    var crumb = document.querySelector('.page-head__crumb-current');
    if (crumb && post.title) crumb.textContent = post.title;
    var cat = document.querySelector('.blog-article-category');
    if (cat && post.category) cat.textContent = categoryDisplayLabel(post.category);
    var title = document.querySelector('.blog-article-title');
    if (title && post.title) title.textContent = post.title;
    var author = String(post.author || 'New Era Team').trim() || 'New Era Team';
    var dateEl = document.querySelector('.blog-article-date');
    if (dateEl && post.date) {
      dateEl.innerHTML = formatDate(post.date) + ' &nbsp; &#x270D; By ' + escHtml(author);
    }
    var lead = document.querySelector('.blog-article-lead');
    if (lead && post.text) lead.textContent = post.text;
    var feature = document.querySelector('.blog-article-feature__img');
    if (feature && post.image) feature.src = post.image;
    var card = document.querySelector('.blog-article-card');
    var actions = document.querySelector('.blog-article-actions');
    var bodyRaw = normalizeBlogPostBody(post.body, post.text);
    if (card && actions && bodyRaw) {
      var bodyHtml = buildBodyHtml(bodyRaw);
      if (bodyHtml) {
        var temp = document.createElement('div');
        temp.innerHTML = bodyHtml;
        var leadEl = document.querySelector('.blog-article-lead');
        var node = leadEl ? leadEl.nextSibling : null;
        while (node && node !== actions) {
          var next = node.nextSibling;
          card.removeChild(node);
          node = next;
        }
        var frag = document.createDocumentFragment();
        while (temp.firstChild) frag.appendChild(temp.firstChild);
        card.insertBefore(frag, actions);
      }
    }
  }
  function tryApplyCmsArticle() {
    if (!window.AcademyContent || typeof AcademyContent.loadBlogPosts !== 'function') return;
    var posts = AcademyContent.loadBlogPosts() || [];
    if (!Array.isArray(posts) || !posts.length) return;
    var current = basename(window.location.pathname || '');
    var match = null;
    posts.forEach(function(p) {
      var u = basename(p && p.url);
      if (u && u.toLowerCase() === current.toLowerCase()) match = p;
    });
    if (match) renderFromCmsPost(match);
  }
  tryApplyCmsArticle();
  setTimeout(tryApplyCmsArticle, 300);
})();
