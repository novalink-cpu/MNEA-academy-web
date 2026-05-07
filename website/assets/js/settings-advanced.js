(function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function showGen(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
    el.className =
      'settings-gen-msg' + (text ? (ok ? ' settings-gen-msg--ok' : ' settings-gen-msg--err') : '');
  }

  var DEFAULT_ROLES = [
    {
      role: 'admin',
      title: 'Administrator',
      description: 'Full access to every module, backups, and configuration.'
    },
    {
      role: 'teacher',
      title: 'Teacher',
      description: 'Classes, attendance, exams, and data for assigned groups.'
    },
    {
      role: 'student',
      title: 'Student',
      description: 'Own profile, results, and student-facing tools where enabled.'
    }
  ];

  var PERM_KEYS = [
    'student_mgmt',
    'teacher_mgmt',
    'admissions',
    'academic',
    'attendance',
    'exams',
    'communication',
    'content',
    'reports',
    'settings'
  ];

  function defaultGrants() {
    var t = {};
    var s = {};
    PERM_KEYS.forEach(function (id) {
      t[id] = id !== 'settings';
      s[id] = false;
    });
    return { teacher: t, student: s };
  }

  function loadEmail() {
    var statusEl = $('emailConfigStatus');
    if (!statusEl) return;
    if (!window.SchoolAPI || !SchoolAPI.getEmailConfigStatus) {
      statusEl.textContent = 'School API script not loaded.';
      return;
    }
    SchoolAPI.getEmailConfigStatus().then(function (r) {
      if (r && r.ok && r.configured) {
        statusEl.textContent =
          'SMTP is configured on the server (host set). TLS: ' +
          (r.use_tls ? 'on' : 'off') +
          ', port ' +
          (r.smtp_port || 587) +
          '.';
      } else if (r && r.ok) {
        statusEl.textContent =
          'SMTP is not configured. Set SMTP_HOST (and usually SMTP_USER, SMTP_PASS) in the server environment, then restart the app.';
      } else {
        statusEl.textContent = 'Could not read email status. Is the API running?';
      }
    });
    var sig = $('emailSignature');
    if (sig && SchoolAPI.getSettings) {
      SchoolAPI.getSettings().then(function (res) {
        var c = (res && res.config) || {};
        sig.value = String(c.email_signature || c.email_footer || '').trim();
      });
    }
  }

  function saveEmailSignature() {
    var msg = $('emailConfigMsg');
    showGen(msg, '', true);
    var sig = $('emailSignature');
    if (!sig || !window.SchoolAPI || !SchoolAPI.saveSettings) return;
    SchoolAPI.saveSettings({ email_signature: String(sig.value || '').trim() })
      .then(function (r) {
        if (r && r.ok) showGen(msg, 'Signature saved.', true);
        else showGen(msg, (r && r.error) || 'Save failed.', false);
      })
      .catch(function () {
        showGen(msg, 'Save failed.', false);
      });
  }

  function sendTestEmail() {
    var msg = $('emailConfigMsg');
    var to = $('emailTestTo');
    showGen(msg, '', true);
    var addr = to ? String(to.value || '').trim() : '';
    if (!addr) {
      showGen(msg, 'Enter a recipient address.', false);
      return;
    }
    if (!SchoolAPI.sendTestEmail) {
      showGen(msg, 'API helper missing.', false);
      return;
    }
    SchoolAPI.sendTestEmail(addr).then(function (r) {
      if (r && r.ok) showGen(msg, r.message || 'Sent.', true);
      else showGen(msg, (r && r.error) || 'Send failed.', false);
    });
  }

  function mergeRoles(saved) {
    var byRole = {};
    (Array.isArray(saved) ? saved : []).forEach(function (row) {
      if (row && row.role) byRole[String(row.role).toLowerCase()] = row;
    });
    return DEFAULT_ROLES.map(function (def) {
      var ex = byRole[def.role] || {};
      return {
        role: def.role,
        title: String(ex.title || def.title).trim() || def.title,
        description: String(ex.description || def.description).trim() || def.description
      };
    });
  }

  function fillRoles(rows) {
    rows.forEach(function (row) {
      var t = $('roleTitle_' + row.role);
      var d = $('roleDesc_' + row.role);
      if (t) t.value = row.title;
      if (d) d.value = row.description;
    });
  }

  function collectRoles() {
    return DEFAULT_ROLES.map(function (def) {
      var t = $('roleTitle_' + def.role);
      var d = $('roleDesc_' + def.role);
      return {
        role: def.role,
        title: t ? String(t.value || '').trim() : def.title,
        description: d ? String(d.value || '').trim() : ''
      };
    });
  }

  function loadRoles() {
    if (!$('roleTitle_admin')) return;
    if (!window.SchoolAPI || !SchoolAPI.getWebExtra) return;
    SchoolAPI.getWebExtra('system_profiles').then(function (r) {
      var data = (r && r.ok && r.data) || [];
      fillRoles(mergeRoles(data));
    });
  }

  function saveRoles() {
    var msg = $('rolesSaveMsg');
    showGen(msg, '', true);
    if (!SchoolAPI.saveWebExtra) return;
    SchoolAPI.saveWebExtra('system_profiles', collectRoles()).then(function (r) {
      if (r && r.ok) showGen(msg, 'Role descriptions saved.', true);
      else showGen(msg, (r && r.error) || 'Save failed.', false);
    });
  }

  function fillPerms(grants) {
    grants = grants || defaultGrants();
    ['teacher', 'student'].forEach(function (who) {
      PERM_KEYS.forEach(function (id) {
        var el = $('perm_' + who + '_' + id);
        if (!el) return;
        el.checked = !!(grants[who] && grants[who][id]);
      });
    });
  }

  function collectPerms() {
    var grants = { teacher: {}, student: {} };
    ['teacher', 'student'].forEach(function (who) {
      PERM_KEYS.forEach(function (id) {
        var el = $('perm_' + who + '_' + id);
        grants[who][id] = !!(el && el.checked);
      });
    });
    return grants;
  }

  function loadPerms() {
    if (!$('perm_teacher_student_mgmt')) return;
    if (!window.SchoolAPI || !SchoolAPI.getWebExtra) return;
    SchoolAPI.getWebExtra('system_role_permissions').then(function (r) {
      var first = (r && r.ok && r.data && r.data[0]) || null;
      if (!first) {
        fillPerms(defaultGrants());
        return;
      }
      if (first.grants) fillPerms(first.grants);
      else if (first.teacher || first.student) fillPerms(first);
      else fillPerms(defaultGrants());
    });
  }

  function savePerms() {
    var msg = $('permSaveMsg');
    showGen(msg, '', true);
    if (!SchoolAPI.saveWebExtra) return;
    var payload = {
      version: 1,
      note: 'Policy reference; API enforcement may be added in a future release.',
      grants: collectPerms()
    };
    SchoolAPI.saveWebExtra('system_role_permissions', [payload]).then(function (r) {
      if (r && r.ok) showGen(msg, 'Permission matrix saved.', true);
      else showGen(msg, (r && r.error) || 'Save failed.', false);
    });
  }

  function init() {
    var body = document.body;
    if (!body || body.getAttribute('data-account-role') !== 'admin') return;

    var btnRoles = $('rolesSaveBtn');
    if (btnRoles) btnRoles.addEventListener('click', saveRoles);
    var btnPerm = $('permSaveBtn');
    if (btnPerm) btnPerm.addEventListener('click', savePerms);
    var btnSig = $('emailSignatureSave');
    if (btnSig) btnSig.addEventListener('click', saveEmailSignature);
    var btnTest = $('emailTestSend');
    if (btnTest) btnTest.addEventListener('click', sendTestEmail);

    loadRoles();
    loadPerms();
    loadEmail();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
