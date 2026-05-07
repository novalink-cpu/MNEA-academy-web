(function () {
  'use strict';

  var ROLE_PANELS = {
    admin: ['profile', 'password', 'system', 'roles', 'backup', 'email', 'permissions'],
    teacher: ['profile', 'password', 'notifications'],
    student: ['profile', 'password', 'notifications']
  };

  var PANE_BY_KEY = {
    profile: 'settingsPaneProfile',
    password: 'settingsPanePassword',
    notifications: 'settingsPaneNotifications',
    general: 'settingsPaneSystem',
    system: 'settingsPaneSystem',
    roles: 'settingsPaneRoles',
    backup: 'settingsPaneBackup',
    email: 'settingsPaneEmail',
    permissions: 'settingsPanePermissions'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function showMsg(el, text, isErr) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'settings-msg' + (text ? (isErr ? ' settings-msg--error' : ' settings-msg--ok') : '');
    el.style.display = text ? 'block' : 'none';
  }

  function getRole() {
    var r = (document.body && document.body.getAttribute('data-account-role')) || '';
    r = String(r).trim().toLowerCase();
    if (r === 'admin' || r === 'teacher' || r === 'student') return r;
    return 'student';
  }

  function allowedPanels(role) {
    return ROLE_PANELS[role] || ROLE_PANELS.student;
  }

  function isAllowed(role, key) {
    return allowedPanels(role).indexOf(key) >= 0;
  }

  function applyRoleVisibility(role) {
    var allow = allowedPanels(role);
    document.querySelectorAll('.settings-feature-card[data-settings-panel]').forEach(function (card) {
      var key = card.getAttribute('data-settings-panel') || '';
      var ok = allow.indexOf(key) >= 0;
      card.style.display = ok ? '' : 'none';
      card.setAttribute('aria-hidden', ok ? 'false' : 'true');
      if (!ok) {
        card.classList.remove('is-active');
        card.setAttribute('aria-pressed', 'false');
        card.setAttribute('tabindex', '-1');
      } else {
        card.setAttribute('tabindex', '0');
      }
    });
    Object.keys(PANE_BY_KEY).forEach(function (key) {
      var id = PANE_BY_KEY[key];
      var pane = id ? $(id) : null;
      if (!pane) return;
      if (allow.indexOf(key) >= 0) return;
      pane.classList.remove('is-active');
      pane.style.display = 'none';
    });
  }

  function readHashPanel() {
    var h = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (h === 'password') return 'password';
    if (h === 'notifications') return 'notifications';
    if (h === 'general') return 'system';
    if (h === 'system') return 'system';
    if (h === 'roles') return 'roles';
    if (h === 'backup') return 'backup';
    if (h === 'email') return 'email';
    if (h === 'permissions') return 'permissions';
    return 'profile';
  }

  function updateUrlHashForPanel(key) {
    if (key === 'profile') {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (e) {
        try {
          window.location.hash = '';
        } catch (e2) {}
      }
      return;
    }
    try {
      window.location.hash = key;
    } catch (e3) {}
  }

  function showPanel(role, key, skipUrl) {
    var allow = allowedPanels(role);
    if (allow.indexOf(key) < 0) key = 'profile';

    Object.keys(PANE_BY_KEY).forEach(function (k) {
      var pane = $(PANE_BY_KEY[k]);
      if (!pane) return;
      if (allow.indexOf(k) < 0) return;
      pane.style.display = '';
      pane.classList.toggle('is-active', k === key);
    });

    document.querySelectorAll('.settings-feature-card[data-settings-panel]').forEach(function (c) {
      var k = c.getAttribute('data-settings-panel') || '';
      if (allowedPanels(role).indexOf(k) < 0) return;
      var on = k === key;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (!skipUrl) updateUrlHashForPanel(key);
  }

  function fillProfileForm() {
    var u = window.AcademyAuth && AcademyAuth.currentUser();
    if (!u || !AcademyAuth.getUserProfile) return;
    AcademyAuth.getUserProfile(u.uid, function (p) {
      p = p || {};
      var dn = $('settingsDisplayName');
      var un = $('settingsUsername');
      var roleEl = $('settingsRole');
      var uid = $('settingsUserId');
      var em = $('settingsEmail');
      if (dn) dn.value = (p.displayName || '').trim() || '';
      if (un) un.value = (p.username || '').trim() || '—';
      if (roleEl) roleEl.value = (p.role || '').trim() || '—';
      if (uid) uid.value = (p.id || '').trim() || '—';
      if (em) em.value = (p.email || '').trim() || '—';
    });
  }

  function saveDisplayName() {
    var msg = $('settingsProfileMsg');
    showMsg(msg, '', false);
    var dn = $('settingsDisplayName');
    var name = dn ? String(dn.value || '').trim() : '';
    if (!name) {
      showMsg(msg, 'Please enter a display name.', true);
      return;
    }
    var u = window.AcademyAuth && AcademyAuth.currentUser();
    if (!u || !AcademyAuth.setUserProfile) return;
    AcademyAuth.setUserProfile(u.uid, { displayName: name }, function () {
      showMsg(msg, 'Display name updated for this browser session.', false);
      var pn = $('profileName');
      if (pn) pn.textContent = name;
    });
  }

  function submitPasswordChange() {
    var msg = $('settingsPasswordMsg');
    showMsg(msg, '', false);
    var cur = $('settingsCurrentPassword');
    var nw = $('settingsNewPassword');
    var cf = $('settingsConfirmPassword');
    var c = cur ? String(cur.value || '') : '';
    var n = nw ? String(nw.value || '') : '';
    var c2 = cf ? String(cf.value || '') : '';
    if (!c) {
      showMsg(msg, 'Enter your current password.', true);
      return;
    }
    if (!n || n.length < 6) {
      showMsg(msg, 'New password must be at least 6 characters.', true);
      return;
    }
    if (n !== c2) {
      showMsg(msg, 'New password and confirmation do not match.', true);
      return;
    }
    if (!window.SchoolAPI || !SchoolAPI.changePassword || !SchoolAPI.getConfig) {
      showMsg(
        msg,
        'School server API is not available. Open this site from the school app (e.g. port 5001) or use the server change-password page if your school uses MySQL accounts.',
        true
      );
      return;
    }
    var u = window.AcademyAuth && AcademyAuth.currentUser();
    if (!u || !AcademyAuth.getUserProfile) return;
    AcademyAuth.getUserProfile(u.uid, function (p) {
      p = p || {};
      var username = String(p.username || '').trim();
      if (!username) {
        showMsg(msg, 'Could not read your username from the session.', true);
        return;
      }
      SchoolAPI.getConfig()
        .then(function (cfg) {
          var schoolId = cfg && cfg.school_id != null ? String(cfg.school_id) : '';
          return SchoolAPI.changePassword(schoolId, username, c, n);
        })
        .then(function (res) {
          if (res && res.ok) {
            showMsg(msg, (res.message || 'Password updated.') + ' Use the new password next time you sign in.', false);
            if (cur) cur.value = '';
            if (nw) nw.value = '';
            if (cf) cf.value = '';
            return;
          }
          var err = (res && res.error) || 'Could not change password.';
          if (String(err).indexOf('fetch') >= 0 || String(err).indexOf('Network') >= 0) {
            err = 'Cannot reach the school server. Check that the API is running and SCHOOL_API_BASE is correct.';
          }
          showMsg(msg, err, true);
        })
        .catch(function () {
          showMsg(msg, 'Request failed. Check your connection and server status.', true);
        });
    });
  }

  function loadNotifPrefs() {
    var chk = $('settingsNotifSound');
    if (!chk) return;
    var v = '1';
    try {
      v = localStorage.getItem('mnea_notif_sound_enabled');
    } catch (e) {}
    chk.checked = v !== '0';
  }

  function wireNotifPrefs() {
    var chk = $('settingsNotifSound');
    if (!chk) return;
    chk.addEventListener('change', function () {
      try {
        localStorage.setItem('mnea_notif_sound_enabled', chk.checked ? '1' : '0');
      } catch (e) {}
      var msg = $('settingsNotifPrefsMsg');
      showMsg(msg, 'Saved.', false);
      window.setTimeout(function () {
        showMsg(msg, '', false);
      }, 1600);
    });
    loadNotifPrefs();
  }

  function init(opts) {
    opts = opts || {};
    var role = opts.role || getRole();

    applyRoleVisibility(role);

    var start = readHashPanel();
    if (!isAllowed(role, start)) {
      start = 'profile';
      showPanel(role, start, true);
      updateUrlHashForPanel('profile');
    } else {
      showPanel(role, start, true);
    }

    document.querySelectorAll('.settings-feature-card[data-settings-panel]').forEach(function (card) {
      function activate(ev) {
        if (ev) {
          if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
          if (ev.type === 'keydown') ev.preventDefault();
        }
        var k = card.getAttribute('data-settings-panel') || 'profile';
        if (!isAllowed(role, k)) return;
        showPanel(role, k, false);
      }
      card.addEventListener('click', activate);
      card.addEventListener('keydown', activate);
      var k = card.getAttribute('data-settings-panel') || '';
      if (isAllowed(role, k)) card.setAttribute('aria-pressed', card.classList.contains('is-active') ? 'true' : 'false');
    });

    window.addEventListener('hashchange', function () {
      var k = readHashPanel();
      if (!isAllowed(role, k)) {
        showPanel(role, 'profile', false);
        return;
      }
      showPanel(role, k, true);
    });

    var saveBtn = $('settingsSaveDisplayName');
    if (saveBtn) saveBtn.addEventListener('click', saveDisplayName);

    var pwBtn = $('settingsPasswordSubmit');
    if (pwBtn) pwBtn.addEventListener('click', submitPasswordChange);

    fillProfileForm();
    wireNotifPrefs();
  }

  window.MneaAccountSettings = { init: init };

  if (document.body && document.body.getAttribute('data-account-role')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        init();
      });
    } else {
      init();
    }
  }
})();
