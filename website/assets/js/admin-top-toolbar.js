/**
 * Shared admin top bar: notifications (Firebase + local), profile, logout.
 * Expects DOM ids from admin/dashboard.html (btnNotification, notificationList, …).
 */
(function() {
  function inquiryKey(it) {
    it = it || {};
    if (it.client_submission_id) return 'cid:' + String(it.client_submission_id);
    var created = (it.createdAt != null && it.createdAt !== '') ? it.createdAt : (it.created_at || '');
    var hasSignatureParts = !!(it.email || it.phone || it.message || created || it.name);
    if (hasSignatureParts) {
      return [
        'sig',
        String(it.email || ''),
        String(it.phone || ''),
        String(it.message || ''),
        String(created),
        String(it.name || '')
      ].join('|');
    }
    if (it._id) return 'id:' + String(it._id);
    if (it.id) return 'id:' + String(it.id);
    return [
      'legacy',
      String(it.email || ''),
      String(it.phone || ''),
      String(it.message || ''),
      String(it.createdAt || ''),
      String(it.name || '')
    ].join('|');
  }
  function mergeInquiryLists(listA, listB) {
    var out = [];
    var seen = {};
    safeArr(listA).concat(safeArr(listB)).forEach(function(it) {
      var key = inquiryKey(it);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(it || {});
    });
    out.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return out;
  }
  function normalizeInquiryRecord(it) {
    var src = it && typeof it === 'object' ? it : {};
    var out = Object.assign({}, src);
    if (out.createdAt == null || out.createdAt === '') {
      out.createdAt = out.created_at || out.date || out.submittedAt || Date.now();
    }
    return out;
  }
  var notifState = {
    inquiryUnread: 0,
    placementUnread: 0,
    lastPlacementMessage: ''
  };
  var readMap = { inquiries: {}, placements: {} };
  var cacheRecentInquiries = [];
  var cacheMergedPlacements = [];

  var canPlayNotifSound = false;
  function unlockNotificationSound() {
    canPlayNotifSound = true;
  }
  document.addEventListener('click', unlockNotificationSound, { once: true });
  document.addEventListener('keydown', unlockNotificationSound, { once: true });
  function safeArr(v) { return Array.isArray(v) ? v : []; }
  function sanitizeNotifSegment(k) {
    return String(k == null ? '' : k).replace(/[.#$\[\]\/]/g, '_').slice(0, 240);
  }
  function inquiryReadKey(it) {
    it = it || {};
    if (it._id) return sanitizeNotifSegment(String(it._id));
    return sanitizeNotifSegment('h:' + inquiryKey(it));
  }
  function placementKeyOf(s) {
    if (!s) return '';
    if (s.client_submission_id) return 'cid:' + s.client_submission_id;
    if (s.application_id) return 'aid:' + s.application_id;
    if (s._id) return 'id:' + s._id;
    var when = s.submittedAt || s.submitted_at || s.test_date || s.applied_date || s.createdAt || s.created_at || '';
    return 'legacy:' + [s.name || s.student_name || '', s.phone || '', when].join('|');
  }
  function placementStorageKey(s) {
    return sanitizeNotifSegment(placementKeyOf(s));
  }
  function mergePlacementLists(listA, listB) {
    var out = [];
    var seen = {};
    safeArr(listA).concat(safeArr(listB)).forEach(function(it) {
      var key = placementKeyOf(it);
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(it || {});
    });
    out.sort(function(a, b) { return String(b && b.submittedAt || '').localeCompare(String(a && a.submittedAt || '')); });
    return out;
  }
  function normalizePlacementRecord(s) {
    var src = s && typeof s === 'object' ? s : {};
    var out = Object.assign({}, src);
    if (out.submittedAt == null || out.submittedAt === '') {
      out.submittedAt = out.submitted_at || out.test_date || out.applied_date || out.createdAt || out.created_at || '';
    }
    return out;
  }
  function getPlacementLocalFallback() {
    var out = [];
    try {
      var rawMany = localStorage.getItem('placement_test_submissions') || '[]';
      var many = JSON.parse(rawMany);
      if (Array.isArray(many)) out = out.concat(many);
    } catch (e) {}
    try {
      var rawOne = localStorage.getItem('placement_test_submission');
      if (rawOne) {
        var one = JSON.parse(rawOne);
        if (one && typeof one === 'object') out.push(one);
      }
    } catch (e) {}
    return out;
  }
  function getKnownPlacementKeys() {
    try {
      var raw = localStorage.getItem('mnea_known_placement_submission_keys') || '[]';
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function setKnownPlacementKeys(keys) {
    try { localStorage.setItem('mnea_known_placement_submission_keys', JSON.stringify(keys || [])); } catch (e) {}
  }
  function getSeenKeys(key) {
    try {
      var raw = localStorage.getItem(key) || '[]';
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function appendSeenKey(storageKey, value) {
    var arr = getSeenKeys(storageKey);
    if (arr.indexOf(value) >= 0) return;
    arr.push(value);
    try { localStorage.setItem(storageKey, JSON.stringify(arr)); } catch (e) {}
  }
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  /** Bell + red badge (matches visible notification affordance); keeps same element ids for counts. */
  function upgradeNotificationButtonUI() {
    var btn = document.getElementById('btnNotification');
    if (!btn || btn.getAttribute('data-notif-bell-ui') === '1') return;
    var lab = document.getElementById('notificationLabel');
    var labelText = (lab && lab.textContent && lab.textContent.trim()) ? lab.textContent.trim() : 'Notifications';
    var countEl = document.getElementById('notificationCount');
    var totalN = parseInt(countEl && countEl.textContent ? countEl.textContent : '0', 10) || 0;
    btn.setAttribute('data-notif-bell-ui', '1');
    btn.classList.add('notification-bell-btn');
    btn.classList.toggle('has-notif', totalN > 0);
    var badgeTxt = totalN > 99 ? '99+' : String(totalN);
    btn.innerHTML =
      '<span class="notification-bell" aria-hidden="true"><i class="fa-solid fa-bell"></i></span>' +
      '<span id="notificationLabel" class="notification-sr-only">' + escHtml(labelText) + '</span>' +
      '<span id="notificationCount" class="notification-count-num notification-sr-only">' + escHtml(String(totalN)) + '</span>' +
      '<span class="notification-badge" id="notificationBadge" aria-hidden="true">' + escHtml(badgeTxt) + '</span>';
    btn.setAttribute('aria-label', labelText + (totalN > 0 ? ', ' + totalN + ' unread' : ''));
  }
  function formatTsDate(ts) {
    if (ts == null || ts === '') return '—';
    function fmt(d) {
      if (!d || isNaN(d.getTime())) return '—';
      var dd = String(d.getDate()).padStart(2, '0');
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var yyyy = String(d.getFullYear());
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi;
    }
    var n = typeof ts === 'number' ? ts : parseInt(ts, 10);
    if (!isNaN(n) && n > 1e11) {
      try { return fmt(new Date(n)); } catch (e) { return '—'; }
    }
    try {
      var d = new Date(ts);
      return fmt(d);
    } catch (e2) { return '—'; }
  }
  function placementDisplayScore(r) {
    if (!r) return '—';
    var t = r.total_score != null ? r.total_score : r.totalScore;
    if (t != null && t !== '') return String(t);
    var sum = (parseInt(r.listening_score, 10) || 0) + (parseInt(r.reading_score, 10) || 0) +
      (parseInt(r.writing_score, 10) || 0) + (parseInt(r.speaking_score, 10) || 0);
    return sum > 0 ? String(sum) : '—';
  }
  function isInquiryReadItem(it) {
    var st = String(it && it.status != null ? it.status : '').trim().toLowerCase();
    var rk = inquiryReadKey(it);
    if (readMap.inquiries && readMap.inquiries[rk]) return true;
    if (getSeenKeys('mnea_seen_inquiry_keys').indexOf(inquiryKey(it)) >= 0) return true;
    // Default fallback: new/pending/empty are treated as unread until explicitly read.
    return !(st === '' || st === 'new' || st === 'pending');
  }
  function isPlacementManualPending(s) {
    if (!s || typeof s !== 'object') return false;
    var w = s.writing_score;
    var sp = s.speaking_score;
    return (w == null || w === '') || (sp == null || sp === '');
  }
  function isPlacementReadItem(s) {
    var st = String(s && s.status != null ? s.status : '').trim().toLowerCase();
    if (st === 'new') return false;
    // Submission cards in Admissions are "pending" until writing/speaking are marked.
    // Keep those visible in bell even if older read keys exist.
    if (isPlacementManualPending(s)) return false;
    var pk = placementStorageKey(s);
    if (readMap.placements && readMap.placements[pk]) return true;
    return getSeenKeys('mnea_seen_placement_keys').indexOf(placementKeyOf(s)) >= 0;
  }
  function playNotificationSound() {
    if (!canPlayNotifSound) return;
    try {
      if (localStorage.getItem('mnea_notif_sound_enabled') === '0') return;
    } catch (e) {}
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      var now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.36);
    } catch (e) {}
  }
  function dispatchNotifUpdated() {
    try {
      window.dispatchEvent(new CustomEvent('mnea-admin-notif-updated', {
        detail: {
          inquiryUnread: notifState.inquiryUnread,
          placementUnread: notifState.placementUnread,
          total: (notifState.inquiryUnread || 0) + (notifState.placementUnread || 0)
        }
      }));
    } catch (e) {}
  }

  function markInquiryRead(it, ev, done) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    var rk = inquiryReadKey(it);
    appendSeenKey('mnea_seen_inquiry_keys', inquiryKey(it));
    readMap.inquiries = readMap.inquiries || {};
    readMap.inquiries[rk] = Date.now();
    applyNotifState();
    if (typeof done === 'function') done();
    if (window.AcademyFirebase && AcademyFirebase.markInquiryNotificationRead) {
      AcademyFirebase.markInquiryNotificationRead(rk, function() {});
    }
  }

  function markPlacementRead(s, ev, done) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    var rawKey = placementKeyOf(s);
    var sk = placementStorageKey(s);
    appendSeenKey('mnea_seen_placement_keys', rawKey);
    readMap.placements = readMap.placements || {};
    readMap.placements[sk] = Date.now();
    applyNotifState();
    if (typeof done === 'function') done();
    if (window.AcademyFirebase && AcademyFirebase.markPlacementNotificationRead) {
      AcademyFirebase.markPlacementNotificationRead(sk, function() {});
    }
  }

  function updateNotificationWidgets() {
    var totalNotif = (notifState.inquiryUnread || 0) + (notifState.placementUnread || 0);
    var notifCount = document.getElementById('notificationCount');
    if (notifCount) notifCount.textContent = totalNotif;
    var btnNotif = document.getElementById('btnNotification');
    var bellUi = btnNotif && btnNotif.getAttribute('data-notif-bell-ui') === '1';
    var badge = document.getElementById('notificationBadge');
    if (badge) {
      badge.textContent = totalNotif > 99 ? '99+' : String(totalNotif);
      if (bellUi) {
        badge.style.removeProperty('display');
        if (btnNotif) {
          btnNotif.classList.toggle('has-notif', totalNotif > 0);
          var lab = document.getElementById('notificationLabel');
          var labTxt = (lab && lab.textContent) ? lab.textContent.trim() : 'Notifications';
          btnNotif.setAttribute('aria-label', labTxt + (totalNotif > 0 ? ', ' + totalNotif + ' unread' : ''));
        }
      } else {
        badge.style.display = totalNotif > 0 ? 'inline-flex' : 'none';
      }
    }
    var listEl = document.getElementById('notificationList');
    if (!listEl) return;

    var parts = [];
    // Dropdown shows unread notifications only.
    var inqShown = cacheRecentInquiries.filter(function(r) { return !isInquiryReadItem(r); });
    var plcShown = cacheMergedPlacements.filter(function(r) { return !isPlacementReadItem(r); });

    if (inqShown.length) {
      parts.push('<li class="notif-section-label" aria-hidden="true">Inquiries</li>');
      inqShown.forEach(function(r) {
        var unread = !isInquiryReadItem(r);
        var rk = escHtml(inquiryReadKey(r));
        var name = escHtml(r.name || '—');
        var email = escHtml(r.email || '—');
        var dt = formatTsDate(r.createdAt);
        var cls = 'notif-entry notif-entry--inquiry' + (unread ? ' notif-entry--unread' : '');
        parts.push(
          '<li class="' + cls + '">' +
          '<button type="button" class="notif-entry-btn" data-notif-kind="inquiry" data-notif-key="' + rk + '">' +
          '<span class="notif-entry-title">' + name + '</span>' +
          '<span class="notif-entry-meta">' + email + ' · ' + escHtml(dt) + '</span>' +
          '</button></li>'
        );
      });
    }

    if (plcShown.length) {
      parts.push('<li class="notif-section-label" aria-hidden="true">Placement test</li>');
      plcShown.forEach(function(r) {
        var unread = !isPlacementReadItem(r);
        var sk = escHtml(placementStorageKey(r));
        var nm = escHtml(r.name || r.student_name || '—');
        var em = escHtml(r.email || '—');
        var dt = formatTsDate(r.submittedAt);
        var cls = 'notif-entry notif-entry--placement' + (unread ? ' notif-entry--unread' : '');
        parts.push(
          '<li class="' + cls + '">' +
          '<button type="button" class="notif-entry-btn" data-notif-kind="placement" data-notif-key="' + sk + '">' +
          '<span class="notif-entry-title">' + nm + '</span>' +
          '<span class="notif-entry-meta">' + em + ' · ' + escHtml(dt) + '</span>' +
          '</button></li>'
        );
      });
    }

    if (!parts.length) {
      parts.push('<li class="notif-empty">No inquiries or placement tests yet.</li>');
    }

    var adminBase = (document.body && document.body.getAttribute('data-notif-admin-base')) || '';
    var isStudentToolbar = document.body && document.body.getAttribute('data-toolbar') === 'student';
    if (isStudentToolbar) {
      parts.push(
        '<li class="notif-footer">' +
        '<a href="notice-board.html">School notices</a> · <a href="dashboard.html">Student home</a>' +
        '</li>'
      );
    } else {
      parts.push(
        '<li class="notif-footer">' +
        '<a href="' + escHtml(adminBase) + 'inquiries.html">All inquiries</a> · <a href="' +
        escHtml(adminBase) +
        'admissions.html">Admissions &amp; placement</a>' +
        '</li>'
      );
    }

    listEl.innerHTML = parts.join('');

    function matchInquiryByKey(key) {
      for (var i = 0; i < inqShown.length; i++) {
        if (inquiryReadKey(inqShown[i]) === key) return inqShown[i];
      }
      return null;
    }
    function matchPlacementByKey(key) {
      for (var j = 0; j < plcShown.length; j++) {
        if (placementStorageKey(plcShown[j]) === key) return plcShown[j];
      }
      return null;
    }
    function openNotifTarget(kind) {
      var adminBase = (document.body && document.body.getAttribute('data-notif-admin-base')) || '';
      if (kind === 'placement') {
        window.location.href = adminBase + 'admissions.html';
        return;
      }
      window.location.href = adminBase + 'inquiries.html';
    }
    listEl.querySelectorAll('.notif-entry-btn[data-notif-kind="inquiry"]').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        var key = btn.getAttribute('data-notif-key');
        var it = matchInquiryByKey(key);
        if (!it) return;
        markInquiryRead(it, ev);
        openNotifTarget('inquiry');
      });
    });
    listEl.querySelectorAll('.notif-entry-btn[data-notif-kind="placement"]').forEach(function(btn) {
      btn.addEventListener('click', function(ev) {
        var key = btn.getAttribute('data-notif-key');
        var s = matchPlacementByKey(key);
        if (!s) return;
        markPlacementRead(s, ev);
        openNotifTarget('placement');
      });
    });
  }

  function applyNotifState() {
    notifState.inquiryUnread = cacheRecentInquiries.filter(function(it) { return !isInquiryReadItem(it); }).length;
    notifState.placementUnread = cacheMergedPlacements.filter(function(s) { return !isPlacementReadItem(s); }).length;

    var countEl = document.getElementById('navInquiryCount');
    if (countEl) countEl.textContent = notifState.inquiryUnread > 0 ? 'Inquiries (' + notifState.inquiryUnread + ')' : '';

    var tbody = document.getElementById('recentInquiriesBody');
    if (tbody) {
      if (cacheRecentInquiries.length === 0) tbody.innerHTML = '<tr><td colspan="3" class="text-muted">No inquiries yet.</td></tr>';
      else tbody.innerHTML = cacheRecentInquiries.slice(0, 2).map(function(r) {
        var d = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
        var name = (r.name || '—').replace(/</g, '&lt;');
        var email = (r.email || '—').replace(/</g, '&lt;');
        return '<tr><td>' + name + '</td><td><a href="mailto:' + email + '">' + email + '</a></td><td>' + d + '</td></tr>';
      }).join('');
    }

    updateNotificationWidgets();
    dispatchNotifUpdated();
  }

  function loadInquiriesAndNotifications() {
    function withTimeout(promise, ms, fallback) {
      return new Promise(function(resolve) {
        var done = false;
        var timer = setTimeout(function() {
          if (done) return;
          done = true;
          resolve(fallback);
        }, Math.max(100, parseInt(ms, 10) || 2500));
        Promise.resolve(promise).then(function(val) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(val);
        }).catch(function() {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(fallback);
        });
      });
    }
    function mergeAndUpdateInquiry(apiList, fbList) {
      // Source of truth = current live API/Firebase data only.
      // Do not merge local demo/cache back in, otherwise deleted inquiries can reappear in bell dropdown.
      var merged = mergeInquiryLists(apiList, fbList);
      cacheRecentInquiries = merged;
      try {
        localStorage.setItem('mnea_admin_inquiries_cache', JSON.stringify(merged));
      } catch (e) {}
    }
    function mergeAndUpdatePlacement(apiList, fbList) {
      var merged = mergePlacementLists(apiList, fbList);
      merged = mergePlacementLists(merged, getPlacementLocalFallback());
      cacheMergedPlacements = merged;
      var known = getKnownPlacementKeys();
      var currentKeys = merged.map(placementKeyOf).filter(Boolean);
      var isFirstRun = known.length === 0;
      var newKeys = currentKeys.filter(function(k) { return known.indexOf(k) < 0; });
      if (!isFirstRun && newKeys.length > 0) {
        notifState.lastPlacementMessage = 'New placement submission (' + newKeys.length + ') just arrived';
        playNotificationSound();
      } else if (!notifState.lastPlacementMessage) {
        notifState.lastPlacementMessage = '';
      }
      setKnownPlacementKeys(currentKeys);
      var prevTotal = parseInt(localStorage.getItem('mnea_last_notif_total_dashboard') || '0', 10) || 0;
      applyNotifState();
      var nextTotal = (notifState.inquiryUnread || 0) + (notifState.placementUnread || 0);
      localStorage.setItem('mnea_last_notif_total_dashboard', String(nextTotal));
      if (nextTotal > prevTotal) playNotificationSound();
    }

    var inquiryApiPromise = Promise.resolve([]);
    if (window.SchoolAPI && SchoolAPI.getWebExtra) {
      inquiryApiPromise = SchoolAPI.getWebExtra('contact_inquiries').then(function(r) {
        return r && r.ok && Array.isArray(r.data) ? r.data : [];
      }).catch(function() { return []; });
    }
    var inquiryFbPromise = new Promise(function(resolve) {
      if (window.AcademyFirebase && AcademyFirebase.getInquiries) {
        AcademyFirebase.getInquiries(function(fbList) { resolve(Array.isArray(fbList) ? fbList : []); });
      } else resolve([]);
    });

    var placementApiPromise = Promise.resolve([]);
    if (window.SchoolAPI && SchoolAPI.getWebExtra) {
      placementApiPromise = SchoolAPI.getWebExtra('placement_test_results').then(function(r) {
        return r && r.ok && Array.isArray(r.data) ? r.data : [];
      }).catch(function() { return []; });
    }
    var placementLegacyApiPromise = Promise.resolve([]);
    if (window.SchoolAPI && SchoolAPI.getWebExtra) {
      placementLegacyApiPromise = SchoolAPI.getWebExtra('admission_applications').then(function(r) {
        return r && r.ok && Array.isArray(r.data) ? r.data : [];
      }).catch(function() { return []; });
    }
    var placementFbPromise = new Promise(function(resolve) {
      if (window.AcademyFirebase && AcademyFirebase.getSubmissions) {
        AcademyFirebase.getSubmissions(function(list) { resolve(Array.isArray(list) ? list : []); });
      } else {
        resolve([]);
      }
    });
    // Keep inquiry badge responsive even if placement endpoints are slow/hanging.
    Promise.all([
      withTimeout(inquiryApiPromise, 3500, []),
      withTimeout(inquiryFbPromise, 3500, [])
    ]).then(function(parts) {
      var inquiryApiList = safeArr(parts[0]).map(normalizeInquiryRecord);
      var inquiryFbList = safeArr(parts[1]).map(normalizeInquiryRecord);
      mergeAndUpdateInquiry(inquiryApiList, inquiryFbList);
      applyNotifState();
    }).catch(function() {
      mergeAndUpdateInquiry([], []);
      applyNotifState();
    });

    Promise.all([
      withTimeout(placementApiPromise, 5000, []),
      withTimeout(placementLegacyApiPromise, 5000, []),
      withTimeout(placementFbPromise, 5000, [])
    ]).then(function(parts) {
      var placementApiList = safeArr(parts[0]).concat(safeArr(parts[1])).map(normalizePlacementRecord);
      var placementFbList = safeArr(parts[2]).map(normalizePlacementRecord);
      mergeAndUpdatePlacement(placementApiList, placementFbList);
    }).catch(function() {
      mergeAndUpdatePlacement([], []);
    });
  }

  function setupDropdowns() {
    var btnNotif = document.getElementById('btnNotification');
    var dropNotif = document.getElementById('notificationDropdown');
    var btnProfile = document.getElementById('btnProfile');
    var dropProfile = document.getElementById('profileDropdown');
    if (dropNotif) {
      dropNotif.addEventListener('click', function(e) {
        e.stopPropagation();
      });
    }
    if (btnNotif && dropNotif) {
      btnNotif.addEventListener('click', function(e) {
        e.stopPropagation();
        dropNotif.classList.toggle('open');
        if (dropProfile) dropProfile.classList.remove('open');
        btnNotif.setAttribute('aria-expanded', dropNotif.classList.contains('open'));
      });
    }
    if (btnProfile && dropProfile) {
      btnProfile.addEventListener('click', function(e) {
        e.stopPropagation();
        dropProfile.classList.toggle('open');
        if (dropNotif) dropNotif.classList.remove('open');
        btnProfile.setAttribute('aria-expanded', dropProfile.classList.contains('open'));
      });
    }
    if (!window.__adminToolbarDocClick) {
      window.__adminToolbarDocClick = true;
      document.addEventListener('click', function() {
        var dn = document.getElementById('notificationDropdown');
        var dp = document.getElementById('profileDropdown');
        var bn = document.getElementById('btnNotification');
        var bp = document.getElementById('btnProfile');
        if (dn) dn.classList.remove('open');
        if (dp) dp.classList.remove('open');
        if (bn) bn.setAttribute('aria-expanded', 'false');
        if (bp) bp.setAttribute('aria-expanded', 'false');
      });
    }
  }

  function wireLogout() {
    var lo = document.getElementById('btnAdminToolbarLogout');
    if (!lo || lo.getAttribute('data-toolbar-wired') === '1') return;
    lo.setAttribute('data-toolbar-wired', '1');
    lo.addEventListener('click', function() {
      if (window.AcademyAuth && AcademyAuth.signOut) {
        AcademyAuth.signOut(function() { window.location.href = '../public-page/index.html'; });
      }
    });
  }

  window.AdminTopToolbar = {
    init: function() {
      if (window.__adminTopToolbarInited) return;
      if (!document.getElementById('btnNotification')) return;
      window.__adminTopToolbarInited = true;
      upgradeNotificationButtonUI();
      var isTeacherToolbar = document.body && document.body.getAttribute('data-toolbar') === 'teacher';
      var isStudentToolbar = document.body && document.body.getAttribute('data-toolbar') === 'student';

      if (window.AcademyFirebase && AcademyFirebase.subscribeAdminNotificationRead) {
        try {
          if (window.__mneaUnsubNotifRead) window.__mneaUnsubNotifRead();
        } catch (e) {}
        window.__mneaUnsubNotifRead = AcademyFirebase.subscribeAdminNotificationRead(function(m) {
          readMap = m || { inquiries: {}, placements: {} };
          applyNotifState();
        });
      }

      var user = window.AcademyAuth && AcademyAuth.currentUser();
      if (user && AcademyAuth.getUserProfile) {
        AcademyAuth.getUserProfile(user.uid, function(profile) {
          var u = AcademyAuth.currentUser();
          var name = (profile && profile.displayName) || (u && u.email) || (isTeacherToolbar ? 'Teacher' : isStudentToolbar ? 'Student' : 'Admin');
          var pn = document.getElementById('profileName');
          if (pn) pn.textContent = name;
          var roleEl = document.getElementById('teacherToolbarRole');
          if (roleEl && isStudentToolbar) {
            roleEl.textContent = 'Student';
          } else if (roleEl && isTeacherToolbar) {
            var r = (profile && profile.role) || 'teacher';
            roleEl.textContent = r === 'admin' ? 'Admin (also teacher)' : 'Teacher';
          }
        });
      }

      wireLogout();
      loadInquiriesAndNotifications();
      setupDropdowns();
      setInterval(loadInquiriesAndNotifications, 5000);
      window.addEventListener('storage', function(ev) {
        if (!ev) return;
        if (ev.key === 'mnea_admin_inquiries_cache' || ev.key === 'placement_test_submission' || ev.key === 'placement_test_submissions') {
          loadInquiriesAndNotifications();
        }
      });
    }
  };

  window.__refreshAdminNotifications = loadInquiriesAndNotifications;
  window.__playAdminNotifSound = playNotificationSound;
})();
