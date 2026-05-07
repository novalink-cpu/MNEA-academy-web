/**
 * Public site: site-lang → en | my only.
 * Management (/admin/, /teacher/, /student/): management-ui-lang → en | my | both
 *   - en: English strings
 *   - my: Myanmar where present; otherwise English fallback
 *   - both: show English · Myanmar when both differ; otherwise single line
 */
(function () {
  (function ensureBackToTopScript() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('academyBackToTopScript')) return;
    var src = '';
    try {
      src =
        document.currentScript && document.currentScript.src
          ? document.currentScript.src.replace(/[^\/?#]+(\?.*)?$/, 'backToTop.js')
          : '';
    } catch (e) {}
    if (!src) return;
    var s = document.createElement('script');
    s.id = 'academyBackToTopScript';
    s.src = src;
    s.defer = true;
    (document.head || document.documentElement).appendChild(s);
  })();

  function isManagementShell() {
    try {
      var p = (window.location && window.location.pathname) || '';
      return p.indexOf('/admin/') >= 0 || p.indexOf('/teacher/') >= 0 || p.indexOf('/student/') >= 0;
    } catch (e) {
      return false;
    }
  }

  var STORAGE_KEY = isManagementShell() ? 'management-ui-lang' : 'site-lang';

  function getLangRaw() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function normalizeLang(lang) {
    var l = String(lang || '').trim();
    if (isManagementShell()) {
      if (l === 'en' || l === 'my' || l === 'both') return l;
      return 'en';
    }
    if (l === 'both') return 'en';
    if (l === 'en' || l === 'my') return l;
    return 'en';
  }

  function getLang() {
    var v = getLangRaw();
    if (v) return normalizeLang(v);
    return 'en';
  }

  function injectDualStylesOnce() {
    if (document.getElementById('mnea-mgmt-dual-style')) return;
    var st = document.createElement('style');
    st.id = 'mnea-mgmt-dual-style';
    st.textContent =
      '.mnea-mgmt-dual{display:block;line-height:1.4;text-align:inherit}' +
      '.mnea-mgmt-dual__en{font-weight:600;color:#0f172a}' +
      '.mnea-mgmt-dual__sep{color:#94a3b8;font-weight:400;padding:0 0.15em}' +
      '.mnea-mgmt-dual__my{color:#1e293b}';
    (document.head || document.documentElement).appendChild(st);
  }

  function escText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  var __mneaFlatDictPromise = null;

  /** Loads flat en→my map for management pages (same directory as this script). */
  function fetchMgmtI18nDict() {
    if (!isManagementShell()) return Promise.resolve({});
    try {
      if (window.__MNEA_MGMT_I18N_FLAT && typeof window.__MNEA_MGMT_I18N_FLAT === 'object') {
        var ks = Object.keys(window.__MNEA_MGMT_I18N_FLAT);
        if (ks.length) return Promise.resolve(window.__MNEA_MGMT_I18N_FLAT);
      }
    } catch (e0) {}
    if (__mneaFlatDictPromise) return __mneaFlatDictPromise;
    var url = '';
    try {
      var sc = document.querySelector('script[src*="lang-switcher"]');
      if (sc && sc.src) {
        url = sc.src.replace(/lang-switcher\.js(\?[^#]*)?(#.*)?$/i, 'management-i18n-dict.json');
      }
    } catch (eJ) {}
    if (!url) {
      try {
        var path = (window.location && window.location.pathname) || '';
        if (path.indexOf('/admin/') >= 0 || path.indexOf('/teacher/') >= 0 || path.indexOf('/student/') >= 0) {
          url = '../assets/js/management-i18n-dict.json';
        }
      } catch (eP) {}
    }
    if (!url) {
      window.__MNEA_MGMT_I18N_FLAT = {};
      __mneaFlatDictPromise = Promise.resolve({});
      return __mneaFlatDictPromise;
    }
    __mneaFlatDictPromise = fetch(url, { credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : {};
      })
      .catch(function () {
        return {};
      })
      .then(function (obj) {
        window.__MNEA_MGMT_I18N_FLAT =
          obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
        return window.__MNEA_MGMT_I18N_FLAT;
      });
    return __mneaFlatDictPromise;
  }

  /** Sidebar / toolbar / chrome — elements without data-lang-* */
  function shellKeyForI18n() {
    var b = document.body;
    if (!b) return 'admin';
    if (b.getAttribute('data-toolbar') === 'teacher') return 'teacher';
    if (b.getAttribute('data-toolbar') === 'student') return 'student';
    return 'admin';
  }

  function linkFileBasename(a) {
    var h = (a.getAttribute('href') || '').trim();
    if (!h) return '';
    try {
      var u = new URL(h, window.location.href);
      var seg = (u.pathname || '').split('/').pop() || '';
      return String(seg.split('?')[0] || '').toLowerCase();
    } catch (e2) {
      var parts = h.split(/[/\\]/);
      var last = parts.pop() || '';
      return String(last.split('?')[0] || '').toLowerCase();
    }
  }

  var MNEA_NAV_I18N = {
    admin: {
      'dashboard.html': { en: 'Dashboard', my: 'ဒက်ရှ်ဘုတ်' },
      'admissions.html': { en: 'Admission Management', my: 'မှတ်ပုံတင်စီမံခန့်ခွဲမှု' },
      'students.html': { en: 'Student Management', my: 'ကျောင်းသားစီမံခန့်ခွဲမှု' },
      'teachers.html': { en: 'Teacher Management', my: 'ဆရာစီမံခန့်ခွဲမှု' },
      'academic.html': { en: 'Academic Management', my: 'ပညာရေးစီမံခန့်ခွဲမှု' },
      'attendance.html': { en: 'Attendance Management', my: 'တက်ရောက်မှုစီမံခန့်ခွဲမှု' },
      'exams.html': { en: 'Exam Management', my: 'စာမေးပွဲစီမံခန့်ခွဲမှု' },
      'gpa-transcript.html': { en: 'GPA & Transcript Management', my: 'GPA နှင့် မှတ်တမ်းစီမံခန့်ခွဲမှု' },
      'inquiries.html': { en: 'Communication', my: 'ဆက်သွယ်ရေး' },
      'content-management.html': { en: 'Page Content Management', my: 'စာမျက်နှာအကြောင်းအရာစီမံခန့်ခွဲမှု' },
      'question-bank.html': { en: 'Question Bank Management', my: 'မေးခွန်းဘဏ်စီမံခန့်ခွဲမှု' },
      'reports.html': { en: 'Reports & Analytics', my: 'အစီရင်ခံစာနှင့် ခွဲခြမ်းစိတ်ဖြာမှု' },
      'settings.html': { en: 'Settings & Configuration', my: 'ဆက်တင်နှင့်စနစ်ချိန်ညှိမှု' },
      'media-library.html': { en: 'Media Library', my: 'မီဒီယာလိုင်ဘရီ' },
      'blog-posts.html': { en: 'Blog Posts', my: 'ဘလော့ပို့စ်များ' },
      'blog-categories.html': { en: 'Blog Categories', my: 'ဘလော့အမျိုးအစားများ' },
      'website-settings.html': { en: 'Website Settings', my: 'ဝက်ဘ်ဆိုဒ်ဆက်တင်များ' }
    },
    teacher: {
      'dashboard.html': { en: 'Dashboard', my: 'ဒက်ရှ်ဘုတ်' },
      'students.html': { en: 'My Students', my: 'ကျောင်းသားများ' },
      'attendance.html': { en: 'Take Attendance', my: 'တက်ရောက်မှတ်ရန်' },
      'attendance-records.html': { en: 'My Records', my: 'မှတ်တမ်းများ' },
      'marks.html': { en: 'Marks Entry', my: 'အမှတ်ထည့်သွင်းရန်' },
      'materials.html': { en: 'Lesson Materials', my: 'သင်ခန်းစာများ' },
      'account-settings.html': { en: 'Teacher profile', my: 'ဆရာ့ကိုယ်ရေးအချက်အလက်' }
    },
    student: {
      'dashboard.html': { en: 'Dashboard', my: 'ဒက်ရှ်ဘုတ်' },
      'courses.html': { en: 'My Courses', my: 'သင်တန်းများ' },
      'attendance.html': { en: 'Attendance', my: 'တက်ရောက်မှု' },
      'exam-results.html': { en: 'Exam Results', my: 'စာမေးပွဲရလဒ်များ' },
      'notice-board.html': { en: 'Notice Board', my: 'ကြေညာချက်များ' },
      'placement-test.html': { en: 'Placement Test', my: 'နေရာချထားစာမေးပွဲ' },
      'progress.html': { en: 'Progress Report', my: 'တိုးတက်မှုအစီရင်ခံစာ' },
      'profile.html': { en: 'Profile', my: 'ကိုယ်ရေးအချက်အလက်' }
    }
  };

  var MNEA_TOOLBAR_MY = {
    'Settings & Configuration': 'ဆက်တင်နှင့်စနစ်ချိန်ညှိမှု',
    'Teacher Dashboard': 'ဆရာ့ဒက်ရှ်ဘုတ်',
    'Student Dashboard': 'ကျောင်းသားဒက်ရှ်ဘုတ်',
    Dashboard: 'ဒက်ရှ်ဘုတ်',
    'Admission Management': 'မှတ်ပုံတင်စီမံခန့်ခွဲမှု',
    'Student Management': 'ကျောင်းသားစီမံခန့်ခွဲမှု',
    'Teacher Management': 'ဆရာစီမံခန့်ခွဲမှု',
    'Academic Management': 'ပညာရေးစီမံခန့်ခွဲမှု',
    'Attendance Management': 'တက်ရောက်မှုစီမံခန့်ခွဲမှု',
    'Exam Management': 'စာမေးပွဲစီမံခန့်ခွဲမှု',
    'GPA & Transcript Management': 'GPA နှင့် မှတ်တမ်းစီမံခန့်ခွဲမှု',
    'Reports & Analytics': 'အစီရင်ခံစာနှင့် ခွဲခြမ်းစိတ်ဖြာမှု',
    'Question Bank Management': 'မေးခွန်းဘဏ်စီမံခန့်ခွဲမှု',
    'Page Content Management': 'စာမျက်နှာအကြောင်းအရာစီမံခန့်ခွဲမှု',
    Communication: 'ဆက်သွယ်ရေး',
    'Media Library': 'မီဒီယာလိုင်ဘရီ',
    Inquiries: 'မေးမြန်းချက်များ'
  };

  function navEntryForSidebarLink(a) {
    var shell = shellKeyForI18n();
    var file = linkFileBasename(a);
    if (!file) return null;
    var t = MNEA_NAV_I18N[shell];
    return t && t[file] ? t[file] : null;
  }

  function setSidebarLinkHtml(a, entry, lang) {
    var badge = a.querySelector('.nav-inquiry-badge');
    if (lang === 'en') {
      if (a.dataset.mneaI18nOrigInner != null) a.innerHTML = a.dataset.mneaI18nOrigInner;
      return;
    }
    if (a.dataset.mneaI18nOrigInner == null) a.dataset.mneaI18nOrigInner = a.innerHTML;
    if (lang === 'my') {
      if (badge) a.innerHTML = entry.my + ' ' + badge.outerHTML;
      else a.textContent = entry.my;
      return;
    }
    if (lang === 'both') {
      if (entry.en === entry.my) {
        if (badge) a.innerHTML = entry.en + ' ' + badge.outerHTML;
        else a.textContent = entry.en;
      } else if (badge) {
        a.innerHTML =
          '<span class="mnea-mgmt-dual"><span class="mnea-mgmt-dual__en">' +
          escText(entry.en) +
          '</span><span class="mnea-mgmt-dual__sep"> · </span><span class="mnea-mgmt-dual__my">' +
          escText(entry.my) +
          '</span></span> ' +
          badge.outerHTML;
      } else {
        a.innerHTML =
          '<span class="mnea-mgmt-dual"><span class="mnea-mgmt-dual__en">' +
          escText(entry.en) +
          '</span><span class="mnea-mgmt-dual__sep"> · </span><span class="mnea-mgmt-dual__my">' +
          escText(entry.my) +
          '</span></span>';
      }
    }
  }

  function managementI18nApplySidebar(lang) {
    var nav = document.querySelector('.dashboard-sidebar nav');
    if (!nav) return;
    nav.querySelectorAll('a[href]').forEach(function (a) {
      if (a.classList.contains('logo-link')) return;
      var entry = navEntryForSidebarLink(a);
      if (!entry) return;
      setSidebarLinkHtml(a, entry, lang);
    });
  }

  function managementI18nApplyToolbar(lang) {
    var el = document.querySelector('.dashboard-toolbar-title');
    if (!el) return;
    var keyEn = (el.getAttribute('data-lang-en') || el.textContent || '').trim();
    if (!keyEn) return;
    var my = MNEA_TOOLBAR_MY[keyEn] || (el.getAttribute('data-lang-my') || '').trim();
    if (!my || my === keyEn) return;
    if (lang === 'en') {
      if (el.dataset.mneaToolbarOrig != null) {
        if (el.dataset.mneaToolbarOrigIsHtml === '1') el.innerHTML = el.dataset.mneaToolbarOrig;
        else el.textContent = el.dataset.mneaToolbarOrig;
      }
      return;
    }
    if (el.dataset.mneaToolbarOrig == null) {
      el.dataset.mneaToolbarOrig = el.innerHTML;
      el.dataset.mneaToolbarOrigIsHtml = el.children.length ? '1' : '0';
    }
    if (lang === 'my') el.textContent = my;
    else if (lang === 'both') {
      el.innerHTML =
        '<span class="mnea-mgmt-dual"><span class="mnea-mgmt-dual__en">' +
        escText(keyEn) +
        '</span><span class="mnea-mgmt-dual__sep"> · </span><span class="mnea-mgmt-dual__my">' +
        escText(my) +
        '</span></span>';
    }
  }

  function managementI18nApplyNotifications(lang) {
    var lab = document.getElementById('notificationLabel');
    if (!lab) return;
    var en = 'Notifications';
    var my = 'အကြောင်းကြားချက်များ';
    if (lang === 'en') {
      if (lab.dataset.mneaOrig != null) lab.textContent = lab.dataset.mneaOrig;
      return;
    }
    if (lab.dataset.mneaOrig == null) lab.dataset.mneaOrig = lab.textContent;
    if (lang === 'my') lab.textContent = my;
    else if (lang === 'both') lab.textContent = en + ' · ' + my;
  }

  function managementI18nApplyFlatLeaves(lang) {
    if (!isManagementShell()) return;
    lang = String(lang || 'en').trim();
    if (lang === 'en') {
      document.querySelectorAll('[data-mnea-flat-orig]').forEach(function (el) {
        var o = el.getAttribute('data-mnea-flat-orig');
        if (o != null) el.innerHTML = o;
        el.removeAttribute('data-mnea-flat-orig');
        el.removeAttribute('data-mnea-flat-key');
      });
      document.querySelectorAll('input[data-mnea-ph-orig], textarea[data-mnea-ph-orig]').forEach(function (inp) {
        var o = inp.getAttribute('data-mnea-ph-orig');
        if (o != null) inp.setAttribute('placeholder', o);
        inp.removeAttribute('data-mnea-ph-orig');
        inp.removeAttribute('data-mnea-ph-key');
      });
      return;
    }
    var dict = window.__MNEA_MGMT_I18N_FLAT || {};
    var root = document.querySelector('.dashboard-main');
    if (!root) return;
    var sel =
      'label, button, a, h1, h2, h3, h4, h5, th, p, span, li, summary, option, dt, dd, small, strong, td';
    root.querySelectorAll(sel).forEach(function (el) {
      if (!el || el.nodeType !== 1) return;
      if (el.closest('script, style, noscript, code, pre')) return;
      if (el.getAttribute('data-no-mnea-i18n') != null) return;
      if (el.hasAttribute('data-lang-en') || el.hasAttribute('data-lang-my')) return;
      if (el.closest('.dashboard-sidebar nav')) return;
      if (el.closest('.logo-headlines')) return;
      if (el.id === 'notificationLabel') return;
      if (
        el.id === 'notificationCount' ||
        el.id === 'notificationBadge' ||
        el.classList.contains('notification-count-num')
      )
        return;
      if (el.closest('.mnea-mgmt-dual')) return;
      if (el.children.length && !el.hasAttribute('data-mnea-flat-key')) return;
      var storedKey = el.getAttribute('data-mnea-flat-key');
      var t = (el.textContent || '').trim().replace(/\s+/g, ' ');
      var keyEn = (storedKey || t).trim();
      if (keyEn.length < 2 || keyEn.length > 180) return;
      if (/^\d{1,8}$/.test(keyEn)) return;
      if (/^\d{1,3}\/\d{1,3}$/.test(keyEn)) return;
      var my = dict[keyEn];
      if (my == null) return;
      my = String(my).trim();
      if (!my || my === keyEn) return;
      if (!el.hasAttribute('data-mnea-flat-orig')) el.setAttribute('data-mnea-flat-orig', el.innerHTML);
      if (!el.hasAttribute('data-mnea-flat-key')) el.setAttribute('data-mnea-flat-key', keyEn);
      if (lang === 'my') el.textContent = my;
      else if (lang === 'both') {
        if (el.tagName === 'OPTION') el.textContent = keyEn + ' · ' + my;
        else {
          el.innerHTML =
            '<span class="mnea-mgmt-dual"><span class="mnea-mgmt-dual__en">' +
            escText(keyEn) +
            '</span><span class="mnea-mgmt-dual__sep"> · </span><span class="mnea-mgmt-dual__my">' +
            escText(my) +
            '</span></span>';
        }
      }
    });
    root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(function (inp) {
      var ph = inp.getAttribute('placeholder');
      if (!ph) return;
      var storedPh = inp.getAttribute('data-mnea-ph-key');
      var pt = (storedPh || ph).trim();
      var myP = dict[pt];
      if (myP == null) return;
      myP = String(myP).trim();
      if (!myP || myP === pt) return;
      if (!inp.hasAttribute('data-mnea-ph-orig')) inp.setAttribute('data-mnea-ph-orig', ph);
      if (!inp.hasAttribute('data-mnea-ph-key')) inp.setAttribute('data-mnea-ph-key', pt);
      if (lang === 'my') inp.setAttribute('placeholder', myP);
      else if (lang === 'both') inp.setAttribute('placeholder', pt + ' / ' + myP);
    });
  }

  function managementI18nApply(lang) {
    if (!isManagementShell()) return;
    lang = String(lang || 'en').trim();
    if (lang !== 'en' && lang !== 'my' && lang !== 'both') lang = 'en';
    injectDualStylesOnce();
    managementI18nApplySidebar(lang);
    managementI18nApplyToolbar(lang);
    managementI18nApplyNotifications(lang);
    managementI18nApplyFlatLeaves(lang);
    if (lang !== 'en') {
      var delay2 = lang === 'both' ? 1200 : 400;
      try {
        setTimeout(function () {
          managementI18nApplyFlatLeaves(lang);
        }, 350);
        setTimeout(function () {
          managementI18nApplyFlatLeaves(lang);
        }, delay2);
      } catch (eT) {}
    }
  }

  function syncNavCoursesFromCms() {
    try {
      if (!window.AcademyContent || !AcademyContent.getCourseItems || !AcademyContent.syncNavCourseDropdownFromItems)
        return;
      AcademyContent.syncNavCourseDropdownFromItems(AcademyContent.getCourseItems(AcademyContent.load()));
    } catch (e) {}
  }

  function updateTextsBothMode() {
    injectDualStylesOnce();
    document.querySelectorAll('[data-lang-en],[data-lang-my]').forEach(function (el) {
      var enHtml = el.getAttribute('data-lang-en-html');
      var myHtml = el.getAttribute('data-lang-my-html');
      if (enHtml != null || myHtml != null) {
        var enH = enHtml || '';
        var myH = myHtml || '';
        if (myH.indexOf('\uFFFD') !== -1) myH = '';
        if (enH.indexOf('\uFFFD') !== -1) enH = '';
        if (myH && enH && myH !== enH) {
          el.innerHTML =
            '<span class="mnea-mgmt-dual"><span class="mnea-mgmt-dual__en">' +
            enH +
            '</span><span class="mnea-mgmt-dual__sep"> · </span><span class="mnea-mgmt-dual__my">' +
            myH +
            '</span></span>';
        } else if (myH) el.innerHTML = myH;
        else if (enH) el.innerHTML = enH;
        return;
      }
      var en = el.getAttribute('data-lang-en');
      var my = el.getAttribute('data-lang-my');
      var enT = en != null ? String(en).trim() : '';
      var myT = my != null ? String(my).trim() : '';
      if (myT.indexOf('\uFFFD') !== -1) myT = '';
      if (!enT && !myT) return;
      if (!myT || myT === enT) {
        el.textContent = enT || myT;
      } else {
        el.innerHTML =
          '<span class="mnea-mgmt-dual"><span class="mnea-mgmt-dual__en">' +
          escText(enT) +
          '</span><span class="mnea-mgmt-dual__sep"> · </span><span class="mnea-mgmt-dual__my">' +
          escText(myT) +
          '</span></span>';
      }
    });
    document.querySelectorAll('[data-placeholder-en], [data-placeholder-my]').forEach(function (el) {
      var pe = el.getAttribute('data-placeholder-en') || '';
      var pm = el.getAttribute('data-placeholder-my') || '';
      if (pm && pm !== pe && pm.indexOf('\uFFFD') === -1) el.placeholder = pe ? pe + ' / ' + pm : pm;
      else el.placeholder = pe || pm;
    });
    try {
      if (window.AcademyContent && typeof AcademyContent.syncActivitiesSlideCaptionLang === 'function') {
        AcademyContent.syncActivitiesSlideCaptionLang();
      }
    } catch (e) {}
    var searchInput = document.querySelector('.nav-search input');
    if (searchInput) searchInput.placeholder = 'Search...';
  }

  function updateTextsEnOrMy(lang) {
    var isMy = lang === 'my';
    var key = isMy ? 'data-lang-my' : 'data-lang-en';
    var keyHtml = isMy ? 'data-lang-my-html' : 'data-lang-en-html';
    document.querySelectorAll('[' + key + ']').forEach(function (el) {
      var text = el.getAttribute(key);
      if (!text || text.indexOf('\uFFFD') !== -1) {
        if (isMy) {
          var fb = el.getAttribute('data-lang-en');
          if (fb && fb.indexOf('\uFFFD') === -1) el.textContent = fb;
        }
        return;
      }
      el.textContent = text;
    });
    document.querySelectorAll('[' + keyHtml + ']').forEach(function (el) {
      var html = el.getAttribute(keyHtml);
      if (!html) {
        if (isMy) {
          var fbh = el.getAttribute('data-lang-en-html');
          if (fbh && fbh.indexOf('\uFFFD') === -1) el.innerHTML = fbh;
        }
        return;
      }
      if (html.indexOf('\uFFFD') !== -1) {
        if (isMy) {
          var fbh2 = el.getAttribute('data-lang-en-html');
          if (fbh2 && fbh2.indexOf('\uFFFD') === -1) el.innerHTML = fbh2;
        }
        return;
      }
      el.innerHTML = html;
    });
    document.querySelectorAll('[data-placeholder-en], [data-placeholder-my]').forEach(function (el) {
      if (isMy) {
        var pm = el.getAttribute('data-placeholder-my');
        var pe = el.getAttribute('data-placeholder-en');
        if (pm && pm.indexOf('\uFFFD') === -1) el.placeholder = pm;
        else if (pe) el.placeholder = pe;
      } else {
        var pe2 = el.getAttribute('data-placeholder-en');
        if (pe2) el.placeholder = pe2;
      }
    });
    try {
      if (window.AcademyContent && typeof AcademyContent.syncActivitiesSlideCaptionLang === 'function') {
        AcademyContent.syncActivitiesSlideCaptionLang();
      }
    } catch (e) {}
    var searchInput = document.querySelector('.nav-search input');
    if (searchInput) searchInput.placeholder = isMy ? '...' : 'Search...';
  }

  function updateTexts(lang) {
    if (lang === 'both') updateTextsBothMode();
    else updateTextsEnOrMy(lang);
  }

  function setLang(lang) {
    lang = normalizeLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {}
    document.documentElement.lang = lang === 'my' ? 'my' : 'en';
    document.body.setAttribute('data-lang', lang);
    syncNavCoursesFromCms();
    updateTexts(lang);
    try {
      managementI18nApply(lang);
    } catch (eM) {}
    try {
      document.body.dispatchEvent(new CustomEvent('lang-switched', { detail: { lang: lang } }));
    } catch (e) {}
  }

  var flagsWired = false;

  function wireFlagButtons() {
    if (flagsWired) return;
    flagsWired = true;
    document.querySelectorAll('.lang-flag[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var l = this.getAttribute('data-lang');
        if (!l) return;
        if (!isManagementShell() && l === 'both') l = 'en';
        setLang(normalizeLang(l));
      });
    });
  }

  function initFromServerThenFinish() {
    try {
      if (isManagementShell()) {
        var cur = localStorage.getItem('management-ui-lang');
        if (!cur) {
          var leg = localStorage.getItem('site-lang');
          if (leg === 'en' || leg === 'my') localStorage.setItem('management-ui-lang', leg);
        }
      }
    } catch (e0) {}

    function finish(lang) {
      setLang(normalizeLang(lang || getLang()));
      wireFlagButtons();
    }
    // Apply immediately from local state; do not block UI language on API latency.
    finish();
    if (!isManagementShell()) return;
    fetchMgmtI18nDict()
      .then(function () {
        try {
          managementI18nApply(getLang());
        } catch (eA) {}
      })
      .catch(function () {});
    if (window.SchoolAPI && typeof SchoolAPI.getSettings === 'function') {
      SchoolAPI.getSettings()
        .then(function (res) {
          var cfg = res && res.config ? res.config : {};
          var s = String(cfg.management_ui_language || cfg.ui_language || '').trim();
          if (s === 'en' || s === 'my' || s === 'both') {
            try {
              localStorage.setItem(STORAGE_KEY, s);
            } catch (e2) {}
            finish(s);
          }
        })
        .catch(function () {});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFromServerThenFinish);
  } else {
    initFromServerThenFinish();
  }

  window.MneaLangSwitcher = {
    setManagementLang: function (lang) {
      if (!isManagementShell()) return;
      var l = normalizeLang(lang);
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch (e) {}
      setLang(l);
    },
    getMode: function () {
      return normalizeLang(getLang());
    },
    isManagementShell: isManagementShell
  };

  window.MneaManagementI18n = { apply: managementI18nApply };
})();
