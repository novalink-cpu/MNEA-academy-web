/**
 * Firebase storage for site content (home + placement test).
 * Requires firebase-config.js and Firebase SDK. If Firebase is not configured, all functions no-op / return null.
 */
(function() {
  'use strict';
  var DB_PATH = 'siteContent';

  function getDb() {
    if (typeof firebase === 'undefined' || !firebase.database) return null;
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.projectId || !cfg.apiKey) return null;
    try {
      firebase.initializeApp(cfg);
    } catch (e) { /* already initialized */ }
    return firebase.database();
  }

  function getAuth() {
    if (typeof firebase === 'undefined' || !firebase.auth) return null;
    getDb();
    return firebase.auth();
  }

  /** siteContent write requires auth != null in database.rules.json */
  function ensureAuthForWrite(callback) {
    var auth = getAuth();
    if (!auth) {
      if (callback) callback(false);
      return;
    }
    if (auth.currentUser) {
      if (callback) callback(true);
      return;
    }
    auth.signInAnonymously().then(function() {
      if (callback) callback(true);
    }).catch(function(err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[AcademyFirebase] Anonymous sign-in failed:', err && err.message);
      }
      if (callback) callback(false);
    });
  }

  window.AcademyFirebase = window.AcademyFirebase || {};

  AcademyFirebase.get = function(callback) {
    var db = getDb();
    if (!db) {
      if (callback) callback(null);
      return;
    }
    db.ref(DB_PATH).once('value').then(function(snap) {
      var val = snap.val();
      if (callback) callback(val || null);
    }).catch(function() {
      if (callback) callback(null);
    });
  };

  AcademyFirebase.set = function(data, callback) {
    var db = getDb();
    if (!db) {
      if (callback) callback(false);
      return;
    }
    ensureAuthForWrite(function(authed) {
      if (!authed) {
        if (callback) callback(false);
        return;
      }
      db.ref(DB_PATH).set(data).then(function() {
        if (callback) callback(true);
      }).catch(function(err) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[AcademyFirebase] siteContent save failed:', err && err.message);
        }
        if (callback) callback(false);
      });
    });
  };

  var LOCAL_SUBMISSIONS_KEY = 'placement_test_submissions';

  AcademyFirebase.isAvailable = function() {
    return !!getDb() || (typeof localStorage !== 'undefined');
  };

  /** Save a placement test submission. Always saves to localStorage ( ). Firebase   . */
  AcademyFirebase.saveSubmission = function(data, callback) {
    var localId = 'local_' + Date.now();
    var item = Object.assign({ _id: localId }, data);
    try {
      var list = [];
      try { list = JSON.parse(localStorage.getItem(LOCAL_SUBMISSIONS_KEY) || '[]'); } catch (e) {}
      if (!Array.isArray(list)) list = [];
      list.unshift(item);
      localStorage.setItem(LOCAL_SUBMISSIONS_KEY, JSON.stringify(list));
    } catch (e) {}
    var db = getDb();
    if (db) {
      db.ref('submissions').push(data).then(function(ref) {
        if (callback) callback(ref.key);
      }).catch(function() {
        if (callback) callback(localId);
      });
      return;
    }
    if (callback) callback(localId);
  };

  /** Get submissions for a user (where data.userId === uid). Calls callback(array). */
  AcademyFirebase.getSubmissionsByUser = function(uid, callback) {
    AcademyFirebase.getSubmissions(function(all) {
      var arr = (all || []).filter(function(s) { return s.userId === uid; });
      arr.sort(function(a, b) { return (b.submittedAt || '') > (a.submittedAt || '') ? 1 : -1; });
      if (callback) callback(arr);
    });
  };

  /** Get all submissions. localStorage     ( ). Firebase   . */
  AcademyFirebase.getSubmissions = function(callback) {
    var fromLocal = [];
    try {
      var raw = localStorage.getItem(LOCAL_SUBMISSIONS_KEY) || '[]';
      fromLocal = JSON.parse(raw);
      if (!Array.isArray(fromLocal)) fromLocal = [];
    } catch (e) {}
    var db = getDb();
    if (!db) {
      fromLocal.sort(function(a, b) { return (b.submittedAt || '') > (a.submittedAt || '') ? 1 : -1; });
      if (callback) callback(fromLocal);
      return;
    }
    db.ref('submissions').once('value').then(function(snap) {
      var val = snap.val();
      var fromFb = [];
      if (val) fromFb = Object.keys(val).map(function(k) { return Object.assign({ _id: k }, val[k]); });
      var merged = fromLocal.concat(fromFb);
      var seen = {};
      merged = merged.filter(function(s) {
        var id = s._id || '';
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      });
      merged.sort(function(a, b) { return (b.submittedAt || '') > (a.submittedAt || '') ? 1 : -1; });
      if (callback) callback(merged);
    }).catch(function() {
      fromLocal.sort(function(a, b) { return (b.submittedAt || '') > (a.submittedAt || '') ? 1 : -1; });
      if (callback) callback(fromLocal);
    });
  };

  /** Delete a submission by id. local_ = localStorage,  = Firebase. */
  AcademyFirebase.deleteSubmission = function(id, callback) {
    var isLocal = (id || '').indexOf('local_') === 0;
    try {
      var list = JSON.parse(localStorage.getItem(LOCAL_SUBMISSIONS_KEY) || '[]');
      if (!Array.isArray(list)) list = [];
      list = list.filter(function(s) { return (s._id || '') !== id; });
      localStorage.setItem(LOCAL_SUBMISSIONS_KEY, JSON.stringify(list));
      if (isLocal) { if (callback) callback(true); return; }
    } catch (e) {}
    var db = getDb();
    if (db && !isLocal) {
      db.ref('submissions/' + id).remove().then(function() { if (callback) callback(true); }).catch(function() { if (callback) callback(false); });
      return;
    }
    if (callback) callback(true);
  };

  /** Update a submission by id. local_ = localStorage,  = Firebase. */
  AcademyFirebase.updateSubmission = function(id, updates, callback) {
    var isLocal = (id || '').indexOf('local_') === 0;
    if (isLocal) {
      try {
        var list = JSON.parse(localStorage.getItem(LOCAL_SUBMISSIONS_KEY) || '[]');
        if (!Array.isArray(list)) list = [];
        var idx = list.findIndex(function(s) { return (s._id || '') === id; });
        if (idx >= 0) {
          Object.assign(list[idx], updates);
          localStorage.setItem(LOCAL_SUBMISSIONS_KEY, JSON.stringify(list));
        }
        if (callback) callback(idx >= 0);
      } catch (e) { if (callback) callback(false); }
      return;
    }
    var db = getDb();
    if (db) {
      db.ref('submissions/' + id).update(updates).then(function() { if (callback) callback(true); }).catch(function() { if (callback) callback(false); });
      return;
    }
    if (callback) callback(false);
  };

  /** Save contact/inquiry form to /inquiries/{pushId}. Admin sees in Communication. Calls callback(id|null). */
  AcademyFirebase.saveInquiry = function(data, callback) {
    var db = getDb();
    if (!db) { if (callback) callback(null); return; }
    var payload = {
      client_submission_id: (data.client_submission_id || '').trim(),
      name: (data.name || '').trim(),
      phone: (data.phone || '').trim(),
      email: (data.email || '').trim(),
      message: (data.message || '').trim(),
      status: data.status || 'new',
      createdAt: data.createdAt || Date.now()
    };
    db.ref('inquiries').push(payload).then(function(ref) {
      if (callback) callback(ref.key);
    }).catch(function(err) {
      if (typeof console !== 'undefined' && console.error) console.error('Inquiry save failed:', err && err.message);
      if (callback) callback(null, err);
    });
  };

  /** Get all inquiries for Admin Communication. Calls callback(array). */
  AcademyFirebase.getInquiries = function(callback) {
    var db = getDb();
    if (!db) { if (callback) callback([]); return; }
    db.ref('inquiries').once('value').then(function(snap) {
      var val = snap.val();
      if (!val) { if (callback) callback([]); return; }
      var arr = Object.keys(val).map(function(k) {
        return Object.assign({ _id: k }, val[k]);
      });
      arr.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      if (callback) callback(arr);
    }).catch(function() { if (callback) callback([]); });
  };

  /** Subscribe real-time inquiries updates. Returns unsubscribe function. */
  AcademyFirebase.subscribeInquiries = function(callback) {
    var db = getDb();
    if (!db) {
      if (callback) callback([]);
      return function() {};
    }
    var ref = db.ref('inquiries');
    var handler = function(snap) {
      var val = snap && snap.val ? snap.val() : null;
      if (!val) { if (callback) callback([]); return; }
      var arr = Object.keys(val).map(function(k) {
        return Object.assign({ _id: k }, val[k]);
      });
      arr.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      if (callback) callback(arr);
    };
    ref.on('value', handler);
    return function() {
      try { ref.off('value', handler); } catch (e) {}
    };
  };

  /* ---------- School DB: attendance, marks, notices ----------
   * attendance: /attendance/{classId}/{date} = { studentId: "present"|"absent", ... }
   * marks:      /marks/{classId}_{examKey}   = { studentId: { subject: score }, ... } or array of rows
   * notices:    /notices/{id}                = { title, body, date }
   */
  AcademyFirebase.getAttendance = function(classId, date, callback) {
    var db = getDb();
    if (!db) { if (callback) callback([]); return; }
    db.ref('attendance/' + (classId || 'default') + '/' + (date || '')).once('value').then(function(snap) {
      var val = snap.val();
      if (!val) { if (callback) callback([]); return; }
      var arr = Array.isArray(val) ? val : Object.keys(val).map(function(k) {
        return { studentId: k, name: k, status: val[k] };
      });
      if (callback) callback(arr);
    }).catch(function() { if (callback) callback([]); });
  };

  AcademyFirebase.saveAttendance = function(classId, date, records, callback) {
    var db = getDb();
    if (!db) { if (callback) callback(false); return; }
    var key = 'attendance/' + (classId || 'default') + '/' + (date || '');
    var data = {};
    (records || []).forEach(function(r) {
        data[r.studentId || r.name || r.id] = (r.status === 'absent' ? 'absent' : 'present');
      });
    db.ref(key).set(data).then(function() {
      if (callback) callback(true);
    }).catch(function() { if (callback) callback(false); });
  };

  AcademyFirebase.getMarks = function(classId, examKey, callback) {
    var db = getDb();
    if (!db) { if (callback) callback([]); return; }
    var path = 'marks/' + (classId || 'default') + '_' + (examKey || 'exam1');
    db.ref(path).once('value').then(function(snap) {
      var val = snap.val();
      if (!val) { if (callback) callback([]); return; }
      var arr = Array.isArray(val) ? val : Object.keys(val).map(function(k) {
        var row = val[k];
        return typeof row === 'object' && row !== null ? Object.assign({ studentId: k }, row) : { studentId: k, marks: row };
      });
      if (callback) callback(arr);
    }).catch(function() { if (callback) callback([]); });
  };

  AcademyFirebase.saveMarks = function(classId, examKey, rows, callback) {
    var db = getDb();
    if (!db) { if (callback) callback(false); return; }
    var path = 'marks/' + (classId || 'default') + '_' + (examKey || 'exam1');
    var data = {};
    (rows || []).forEach(function(r) {
        var id = r.studentId || r.name || r.id;
        if (id) data[id] = r;
      });
    db.ref(path).set(data).then(function() {
      if (callback) callback(true);
    }).catch(function() { if (callback) callback(false); });
  };

  AcademyFirebase.getNotices = function(callback) {
    var db = getDb();
    if (!db) { if (callback) callback([]); return; }
    db.ref('notices').once('value').then(function(snap) {
      var val = snap.val();
      if (!val) { if (callback) callback([]); return; }
      var arr = Object.keys(val).map(function(k) { return Object.assign({ _id: k }, val[k]); });
      arr.sort(function(a, b) { return (b.date || '') > (a.date || '') ? 1 : -1; });
      if (callback) callback(arr);
    }).catch(function() { if (callback) callback([]); });
  };

  /**
   * Admin dashboard: which inquiry / placement notifications have been read.
   * RTDB path: adminNotificationRead/inquiries/{key}, adminNotificationRead/placements/{key}
   * Firebase rules: allow read/write for authenticated admin only.
   */
  var ADMIN_NOTIF_READ = 'adminNotificationRead';
  function sanitizeNotifSegment(k) {
    return String(k == null ? '' : k).replace(/[.#$\[\]\/]/g, '_').slice(0, 240);
  }

  AcademyFirebase.subscribeAdminNotificationRead = function(callback) {
    var db = getDb();
    if (!db) {
      if (callback) callback({ inquiries: {}, placements: {} });
      return function() {};
    }
    var ref = db.ref(ADMIN_NOTIF_READ);
    var handler = function(snap) {
      var val = (snap && snap.val && snap.val()) || {};
      if (callback) callback({
        inquiries: val.inquiries && typeof val.inquiries === 'object' ? val.inquiries : {},
        placements: val.placements && typeof val.placements === 'object' ? val.placements : {}
      });
    };
    ref.on('value', handler);
    return function() {
      try { ref.off('value', handler); } catch (e) {}
    };
  };

  AcademyFirebase.markInquiryNotificationRead = function(storageKey, callback) {
    var sk = sanitizeNotifSegment(storageKey);
    if (!sk) { if (callback) callback(false); return; }
    var db = getDb();
    if (!db) { if (callback) callback(true); return; }
    var ts = typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue
      ? firebase.database.ServerValue.TIMESTAMP
      : Date.now();
    db.ref(ADMIN_NOTIF_READ + '/inquiries/' + sk).set(ts).then(function() {
      if (callback) callback(true);
    }).catch(function() { if (callback) callback(false); });
  };

  AcademyFirebase.markPlacementNotificationRead = function(storageKey, callback) {
    var sk = sanitizeNotifSegment(storageKey);
    if (!sk) { if (callback) callback(false); return; }
    var db = getDb();
    if (!db) { if (callback) callback(true); return; }
    var ts = typeof firebase !== 'undefined' && firebase.database && firebase.database.ServerValue
      ? firebase.database.ServerValue.TIMESTAMP
      : Date.now();
    db.ref(ADMIN_NOTIF_READ + '/placements/' + sk).set(ts).then(function() {
      if (callback) callback(true);
    }).catch(function() { if (callback) callback(false); });
  };
})();
