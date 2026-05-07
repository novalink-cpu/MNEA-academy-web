(function() {
  'use strict';

  (function ensureBackToTopScript() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('academyBackToTopScript')) return;
    var src = '';
    try {
      src = document.currentScript && document.currentScript.src
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

  // Local session auth (no Firebase).
  // Rules:
  // - admin: username=admin, password=admin123
  // - teacher/student: username=name, password=id
  var STORAGE_KEY = 'academy_session_v1';

  function currentPath() {
    return (window.location && window.location.pathname || '').toLowerCase();
  }

  function readSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY) || '';
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return null;
      if (!s.role) return null;
      return s;
    } catch (e) { return null; }
  }

  function writeSession(sess) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sess || {}));
    } catch (e) {}
  }

  function clearSession() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function norm(s) {
    return String(s || '').trim().toLowerCase();
  }

  function firstNonEmpty() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v != null && String(v).trim() !== '') return v;
    }
    return '';
  }

  function relLink(folderFile) {
    // Return a link relative to current folder.
    var p = currentPath();
    if (p.indexOf('/public-page/') >= 0) return '../' + folderFile;
    if (p.indexOf('/admin/') >= 0) return folderFile.replace(/^admin\//, '');
    if (p.indexOf('/teacher/') >= 0) return folderFile.replace(/^teacher\//, '');
    if (p.indexOf('/student/') >= 0) return folderFile.replace(/^student\//, '');
    return folderFile;
  }

  window.AcademyAuth = window.AcademyAuth || {};

  AcademyAuth.currentUser = function() {
    var s = readSession();
    if (!s) return null;
    return { uid: s.uid || 'local-user', email: s.email || '' };
  };

  AcademyAuth.getUserProfile = function(uid, callback) {
    var s = readSession();
    if (callback) callback(s ? {
      displayName: s.displayName || s.username || '—',
      email: s.email || '',
      role: s.role || 'student',
      username: s.username || '',
      id: s.id || '',
      schoolName: s.schoolName || '',
      authSource: s.authSource || ''
    } : null);
  };

  AcademyAuth.setUserProfile = function(uid, data, callback) {
    var s = readSession() || {};
    var next = Object.assign({}, s, data || {});
    if (next.role !== 'admin' && next.role !== 'teacher') next.role = 'student';
    writeSession(next);
    if (callback) callback(true);
  };

  AcademyAuth.signIn = function(username, password, callback) {
    username = String(username || '').trim();
    password = String(password || '').trim();
    if (!username || !password) { if (callback) callback('Username and password required'); return; }

    function legacyLocalAuth() {
      // Offline admin shortcut (only when API path unavailable)
      if (norm(username) === 'admin' && password === 'admin123') {
        writeSession({ role: 'admin', username: 'admin', displayName: 'Admin', id: 'admin', uid: 'local:admin' });
        if (callback) callback(null);
        return;
      }
      if (!window.SchoolAPI) { if (callback) callback('API not available'); return; }
      var done = false;
      function finish(err, sess) {
        if (done) return;
        done = true;
        if (err) { if (callback) callback(err); return; }
        writeSession(sess);
        if (callback) callback(null);
      }
      var pTeacher = (SchoolAPI.getTeachers ? SchoolAPI.getTeachers() : Promise.resolve({ ok: false }));
      pTeacher.then(function(r) {
        var list = (r && r.ok && Array.isArray(r.teachers)) ? r.teachers : (Array.isArray(r) ? r : []);
        var u = norm(username);
        var match = list.find(function(t) {
          var name = norm(firstNonEmpty(t.name, t.teacher_name));
          var tid = String(firstNonEmpty(t.teacher_id, t.username, t.id) || '').trim();
          return name && name === u && tid && tid === password;
        });
        if (match) {
          var tid2 = String(firstNonEmpty(match.teacher_id, match.username, match.id) || '').trim();
          finish(null, { role: 'teacher', username: username, displayName: firstNonEmpty(match.name, match.teacher_name, username), id: tid2, uid: 'local:teacher:' + tid2 });
        } else {
          return (SchoolAPI.getStudents ? SchoolAPI.getStudents() : Promise.resolve({ ok: false })).then(function(rs) {
            var students = (rs && rs.ok && Array.isArray(rs.students)) ? rs.students : (Array.isArray(rs) ? rs : []);
            var ms = students.find(function(s) {
              var nameS = norm(firstNonEmpty(s.name, s.student_name));
              var sid = String(firstNonEmpty(s.student_id, s.id, s.studentId) || '').trim();
              return nameS && nameS === u && sid && sid === password;
            });
            if (ms) {
              var sid2 = String(firstNonEmpty(ms.student_id, ms.id, ms.studentId) || '').trim();
              finish(null, { role: 'student', username: username, displayName: firstNonEmpty(ms.name, ms.student_name, username), id: sid2, uid: 'local:student:' + sid2 });
            } else {
              finish('Invalid username/password');
            }
          });
        }
        return null;
      }).catch(function() { finish('Login failed'); });
    }

    // Preferred: one server (python app.py) validates via POST /api/login (SQLite or MySQL+bcrypt)
    if (window.SchoolAPI && SchoolAPI.login && SchoolAPI.getConfig) {
      SchoolAPI.getConfig().then(function(cfg) {
        var sid = (cfg && cfg.school_id) ? String(cfg.school_id) : '';
        return SchoolAPI.login(sid, username, password);
      }).then(function(res) {
        if (res && res.ok) {
          var role = res.role || 'student';
          if (role === 'class') role = 'teacher';
          var disp = res.display_name || res.username || username;
          var uidStr = String(res.user_id || res.username || '').trim();
          writeSession({
            role: role,
            username: res.username || username,
            displayName: disp,
            id: uidStr || (res.username || username),
            uid: 'server:' + role + ':' + (res.username || username),
            must_change_password: !!res.must_change_password,
            email: (res.email && String(res.email).trim()) || '',
            schoolName: (res.school_name && String(res.school_name).trim()) || '',
            schoolId: (res.school_id && String(res.school_id).trim()) || '',
            authSource: (res.auth_source && String(res.auth_source).trim()) || ''
          });
          if (res.must_change_password) {
            var base = (typeof window !== 'undefined' && window.SCHOOL_API_BASE !== undefined)
              ? window.SCHOOL_API_BASE
              : '';
            if (typeof window !== 'undefined' && window.location && window.location.port === '5001') base = '';
            window.location.href = (base || '') + '/auth/change-password';
            return;
          }
          if (callback) callback(null);
          return;
        }
        if (res && res.ok === false && res.auth_source === 'mysql') {
          if (callback) callback(res.error || 'Invalid username or password');
          return;
        }
        legacyLocalAuth();
      }).catch(function() { legacyLocalAuth(); });
      return;
    }

    legacyLocalAuth();
  };

  AcademyAuth.signUp = function(email, password, displayName, callback) {
    if (callback) callback('Register disabled. Use admin/teacher/student credentials.');
  };

  AcademyAuth.signOut = function(callback) {
    clearSession();
    if (callback) callback();
  };

  AcademyAuth.redirectByRole = function() {
    var s = readSession();
    var role = (s && s.role) ? s.role : 'student';
    if (role === 'admin') window.location.href = relLink('admin/dashboard.html');
    else if (role === 'teacher') window.location.href = relLink('teacher/dashboard.html');
    else window.location.href = relLink('student/dashboard.html');
  };

  AcademyAuth.onAuthStateChanged = function(callback) {
    var u = AcademyAuth.currentUser();
    AcademyAuth.getUserProfile(u && u.uid, function(p) {
      if (callback) callback(u, p);
    });
  };

  AcademyAuth.renderNav = function(containerId) {
    var container = document.getElementById(containerId || 'authNav');
    if (!container) return;
    // Public website: hide role shortcut buttons (Student/Teacher/Admin).
    // Users should enter via the top-bar Login button → login.html → role-based redirect.
    container.innerHTML = '';
    container.style.display = 'none';
  };

  // Public website: always use the top-bar Login button to open login.html
  (function bindTopBarLogin() {
    function bind() {
      var btn = document.getElementById('topBarLogin');
      if (!btn) return;
      // Capture so we override any page-level modal open handlers.
      btn.addEventListener('click', function(e) {
        try { e.preventDefault(); } catch (err) {}
        try { e.stopPropagation(); } catch (err2) {}
        // Ensure role shortcut nav is not used; login page handles role-based redirect.
        window.location.href = relLink('public-page/login.html').replace(/^..\//, '') === 'public-page/login.html'
          ? 'login.html'
          : 'login.html';
      }, true);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  })();
})();
