/**
 * Admin sidebar: "Communication" badge — matches toolbar when loaded; otherwise status=new fallback.
 */
(function() {
  'use strict';
  var pathName = '';
  try { pathName = (window.location && window.location.pathname) ? String(window.location.pathname).toLowerCase() : ''; } catch (e) {}
  var isInquiriesPage = pathName.indexOf('/admin/inquiries.html') >= 0 || /(^|\/)inquiries\.html$/.test(pathName);
  function safeArr(v) { return Array.isArray(v) ? v : []; }
  function seenKeys(key) {
    try {
      var raw = localStorage.getItem(key) || '[]';
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
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
      String(it.createdAt || it.created_at || ''),
      String(it.name || '')
    ].join('|');
  }
  function placementKey(it) {
    it = it || {};
    if (it.client_submission_id) return 'cid:' + String(it.client_submission_id);
    if (it.application_id) return 'aid:' + String(it.application_id);
    if (it._id) return 'id:' + String(it._id);
    return 'legacy:' + [it.name || it.student_name || '', it.phone || '', it.submittedAt || it.submitted_at || ''].join('|');
  }
  function mergeUnique(listA, listB, keyFn) {
    var out = [];
    var seen = {};
    safeArr(listA).concat(safeArr(listB)).forEach(function(it) {
      var k = keyFn(it);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(it || {});
    });
    return out;
  }
  function setBadge(count) {
    var text = count > 0 ? 'Inquiries (' + count + ')' : '';
    document.querySelectorAll('.nav-inquiry-badge').forEach(function(el) {
      el.textContent = text;
    });
  }
  function setTopBell(total) {
    var btn = document.getElementById('btnNotification');
    if (!btn) return;
    var countEl = document.getElementById('notificationCount');
    if (countEl) countEl.textContent = String(total);
    var badge = document.getElementById('notificationBadge');
    if (badge) {
      badge.textContent = total > 99 ? '99+' : String(total);
      var bellUi = btn.getAttribute('data-notif-bell-ui') === '1';
      if (bellUi) {
        badge.style.removeProperty('display');
        btn.classList.toggle('has-notif', total > 0);
      } else {
        badge.style.display = total > 0 ? 'inline-flex' : 'none';
      }
    }
  }
  function getCachedInquiries() {
    try {
      var raw = localStorage.getItem('mnea_admin_inquiries_cache');
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function getPlacementLocal() {
    var list = [];
    try {
      var many = JSON.parse(localStorage.getItem('placement_test_submissions') || '[]');
      if (Array.isArray(many)) list = list.concat(many);
    } catch (e) {}
    try {
      var oneRaw = localStorage.getItem('placement_test_submission');
      if (oneRaw) {
        var one = JSON.parse(oneRaw);
        if (one && typeof one === 'object') list.push(one);
      }
    } catch (e2) {}
    return list;
  }
  function inquiryUnreadCount(list) {
    var seen = seenKeys('mnea_seen_inquiry_keys');
    return safeArr(list).filter(function(it) {
      if (seen.indexOf(inquiryKey(it)) >= 0) return false;
      var st = String(it && it.status != null ? it.status : '').trim().toLowerCase();
      if (st === '' || st === 'new' || st === 'pending') return true;
      return false;
    }).length;
  }
  function placementUnreadLocalCount(list) {
    var seen = seenKeys('mnea_seen_placement_keys');
    var uniq = mergeUnique(list, [], placementKey);
    return uniq.filter(function(it) {
      var st = String(it && it.status != null ? it.status : '').trim().toLowerCase();
      if (st === 'new') return true;
      var pending = (it.writing_score == null || it.writing_score === '') || (it.speaking_score == null || it.speaking_score === '');
      if (pending) return true;
      return seen.indexOf(placementKey(it)) < 0;
    }).length;
  }
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
  function refreshBellFallback() {
    var localInquiries = mergeUnique(getCachedInquiries(), [], inquiryKey);
    var inqCount = inquiryUnreadCount(localInquiries);
    var plcCount = placementUnreadLocalCount(getPlacementLocal());
    setBadge(inqCount);
    setTopBell(inqCount + plcCount);

    var apiPromise = Promise.resolve([]);
    if (window.SchoolAPI && SchoolAPI.getWebExtra) {
      apiPromise = withTimeout(SchoolAPI.getWebExtra('contact_inquiries').then(function(r) {
        return (r && r.ok && Array.isArray(r.data)) ? r.data : [];
      }).catch(function() { return []; }), 3500, []);
    }
    var fbPromise = new Promise(function(resolve) {
      if (!window.AcademyFirebase || !AcademyFirebase.getInquiries) { resolve([]); return; }
      try {
        AcademyFirebase.getInquiries(function(list) { resolve(Array.isArray(list) ? list : []); });
      } catch (e) { resolve([]); }
    });
    Promise.all([apiPromise, withTimeout(fbPromise, 3500, [])]).then(function(parts) {
      var full = mergeUnique(mergeUnique(getCachedInquiries(), [], inquiryKey), parts[0], inquiryKey);
      full = mergeUnique(full, parts[1], inquiryKey);
      var nextInq = inquiryUnreadCount(full);
      var nextPlc = placementUnreadLocalCount(getPlacementLocal());
      setBadge(nextInq);
      setTopBell(nextInq + nextPlc);
    }).catch(function() {});
  }
  function runFallbackBadge() {
    refreshBellFallback();
  }
  window.addEventListener('mnea-admin-notif-updated', function(ev) {
    var d = ev && ev.detail;
    if (d && typeof d.inquiryUnread === 'number') {
      setBadge(d.inquiryUnread);
      if (typeof d.total === 'number') setTopBell(d.total);
    }
  });
  function boot() {
    // inquiries.html has its own accurate page-level sync logic.
    // Avoid double writers that can cause sidebar/bell count mismatch.
    if (isInquiriesPage) return;
    runFallbackBadge();
    setInterval(runFallbackBadge, 5000);
    window.addEventListener('storage', function(ev) {
      if (!ev) return;
      if (
        ev.key === 'mnea_admin_inquiries_cache' ||
        ev.key === 'placement_test_submission' ||
        ev.key === 'placement_test_submissions' ||
        ev.key === 'mnea_seen_inquiry_keys' ||
        ev.key === 'mnea_seen_placement_keys'
      ) {
        runFallbackBadge();
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
