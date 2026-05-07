(function () {
  'use strict';

  var LAST_ACADEMIC_YEAR = '';

  function $(id) {
    return document.getElementById(id);
  }

  function showGenMsg(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
    el.className =
      'settings-gen-msg' + (text ? (ok ? ' settings-gen-msg--ok' : ' settings-gen-msg--err') : '');
  }

  function setAuthLink() {
    var a = $('genAuthConsoleLink');
    if (!a) return;
    try {
      var o = window.location.origin;
      if (o && o !== 'null') a.href = o.replace(/\/$/, '') + '/auth/';
    } catch (e) {}
  }

  function fillAcademicYearSelect(years, current) {
    var sel = $('genAcademicYear');
    if (!sel) return;
    years = Array.isArray(years) ? years.slice() : [];
    sel.innerHTML = '';
    years.forEach(function (y) {
      var o = document.createElement('option');
      o.value = y;
      o.textContent = y;
      sel.appendChild(o);
    });
    var cur = String(current || '').trim();
    if (cur && years.indexOf(cur) < 0) {
      var ex = document.createElement('option');
      ex.value = cur;
      ex.textContent = cur;
      sel.appendChild(ex);
    }
    if (cur) sel.value = cur;
    else if (years.length) sel.value = years[0];
    LAST_ACADEMIC_YEAR = String(sel.value || '').trim();
  }

  function loadGeneral() {
    if (!$('genSchoolName')) return;
    setAuthLink();

    if (!window.SchoolAPI || !SchoolAPI.getConfig || !SchoolAPI.getSettings) return;

    Promise.all([SchoolAPI.getConfig(), SchoolAPI.getSettings()])
      .then(function (pair) {
        var cfg = pair[0] || {};
        var sgRes = pair[1] || {};
        var sg = sgRes.config || {};

        var sid = String(cfg.school_id || sg.school_id || '').trim();
        if ($('genSchoolId')) $('genSchoolId').value = sid || '—';

        fillAcademicYearSelect(cfg.academic_years || [], cfg.academic_year || '');

        if ($('genSchoolName')) {
          $('genSchoolName').value =
            String(sg.school_name || '').trim() ||
            (cfg.schools && cfg.schools[0] && cfg.schools[0].name) ||
            '';
        }
        var tz = String(sg.timezone || 'Asia/Yangon').trim();
        var tzSel = $('genTimezone');
        if (tzSel) {
          var has = Array.prototype.some.call(tzSel.options, function (o) {
            return o.value === tz;
          });
          if (!has) {
            var o = document.createElement('option');
            o.value = tz;
            o.textContent = tz;
            tzSel.appendChild(o);
          }
          tzSel.value = tz;
        }

        var lang = String(sg.management_ui_language || sg.ui_language || 'both').trim();
        var lSel = $('genLanguage');
        if (lSel) {
          lSel.value = ['my', 'en', 'both'].indexOf(lang) >= 0 ? lang : 'both';
        }
        try {
          if (window.MneaLangSwitcher && window.MneaLangSwitcher.isManagementShell && window.MneaLangSwitcher.isManagementShell()) {
            window.MneaLangSwitcher.setManagementLang(lSel ? lSel.value : 'en');
          }
        } catch (eLang) {}

        var df = String(sg.management_date_format || 'DD/MM/YYYY').trim();
        var dfs = $('genDateFormat');
        if (dfs && ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].indexOf(df) >= 0) dfs.value = df;

        var tf = String(sg.management_time_format || '12h').trim();
        var tfs = $('genTimeFormat');
        if (tfs && ['12h', '24h'].indexOf(tf) >= 0) tfs.value = tf;

        var ay = String(sg.management_academic_year_start || 'June').trim();
        var ays = $('genAcademicStart');
        if (ays) {
          var startOpts = ['April', 'May', 'June', 'July', 'August'];
          if (startOpts.indexOf(ay) >= 0) ays.value = ay;
        }

        var syncUrl = String(cfg.sync_server_url || '').trim();
        var wrap = $('sysSyncServerWrap');
        var urlEl = $('sysSyncServerUrl');
        if (wrap && urlEl) {
          if (syncUrl) {
            urlEl.textContent = syncUrl;
            wrap.style.display = '';
          } else {
            wrap.style.display = 'none';
          }
        }
      })
      .catch(function () {});
  }

  function saveGeneral() {
    var msg = $('genSchoolMsg');
    showGenMsg(msg, '', true);

    var payload = {
      school_name: String($('genSchoolName').value || '').trim(),
      timezone: String($('genTimezone').value || '').trim(),
      management_ui_language: String($('genLanguage').value || '').trim(),
      management_date_format: String(($('genDateFormat') && $('genDateFormat').value) || 'DD/MM/YYYY').trim(),
      management_time_format: String(($('genTimeFormat') && $('genTimeFormat').value) || '12h').trim(),
      management_academic_year_start: String(($('genAcademicStart') && $('genAcademicStart').value) || 'June').trim()
    };

    if (!payload.school_name) {
      showGenMsg(msg, 'School name is required.', false);
      return;
    }

    if (!SchoolAPI.saveSettings) {
      showGenMsg(msg, 'School API not available.', false);
      return;
    }

    SchoolAPI.saveSettings(payload)
      .then(function (res) {
        if (!res || !res.ok) {
          showGenMsg(msg, (res && res.error) || 'Could not save settings (is the API running?).', false);
          return Promise.reject();
        }
        var y = String($('genAcademicYear').value || '').trim();
        if (y && y !== LAST_ACADEMIC_YEAR) {
          return SchoolAPI.setAcademicYear(y).then(function (yr) {
            return { yearRes: yr, changedYear: true };
          });
        }
        return { yearRes: { ok: true }, changedYear: false };
      })
      .then(function (bundle) {
        if (!bundle) return;
        var r2 = bundle.yearRes;
        if (!r2 || !r2.ok) {
          showGenMsg(
            msg,
            'School info saved, but academic year failed: ' + ((r2 && r2.error) || 'unknown'),
            false
          );
          return;
        }
        if (bundle.changedYear) LAST_ACADEMIC_YEAR = String($('genAcademicYear').value || '').trim();
        try {
          if (window.MneaLangSwitcher && window.MneaLangSwitcher.setManagementLang) {
            window.MneaLangSwitcher.setManagementLang(payload.management_ui_language);
          }
        } catch (eLang2) {}
        showGenMsg(
          msg,
          bundle.changedYear
            ? 'Saved management preferences. Reload other admin tabs if you changed academic year. Public website unchanged.'
            : 'Saved management preferences. Public website unchanged.',
          true
        );
      })
      .catch(function () {});
  }

  function backup() {
    var el = $('genBackupMsg');
    showGenMsg(el, '', true);
    if (!window.SchoolAPI || !SchoolAPI.backupDatabase) {
      showGenMsg(el, 'API not available.', false);
      return;
    }
    SchoolAPI.backupDatabase()
      .then(function (res) {
        if (res && res.ok) {
          var fn = res.filename || res.path || 'ok';
          showGenMsg(el, 'Backup created: ' + fn, true);
        } else {
          showGenMsg(el, (res && res.error) || 'Backup failed', false);
        }
      })
      .catch(function () {
        showGenMsg(el, 'Backup request failed.', false);
      });
  }

  var restoreFile = null;

  function onRestoreFile() {
    var inp = $('genRestoreFile');
    restoreFile = inp && inp.files && inp.files[0] ? inp.files[0] : null;
    var nameEl = $('genRestoreName');
    var btn = $('genRestoreBtn');
    if (nameEl) nameEl.textContent = restoreFile ? restoreFile.name : 'No file selected.';
    if (btn) btn.disabled = !restoreFile;
  }

  function doRestore() {
    var el = $('genBackupMsg');
    if (!restoreFile) return;
    var n = restoreFile.name.toLowerCase();
    if (n.indexOf('.db') < 0 && n.indexOf('.sqlite') < 0) {
      showGenMsg(el, 'Choose a .db or .sqlite backup file.', false);
      return;
    }
    if (!window.confirm('Replace the LIVE database with this file? All users should stop using the system first.'))
      return;
    if (!window.confirm('This cannot be undone without another backup. Press OK only if you are sure.')) return;
    showGenMsg(el, 'Uploading…', true);
    SchoolAPI.restoreDatabase(restoreFile)
      .then(function (res) {
        if (res && res.ok) {
          showGenMsg(el, 'Database replaced. Reloading…', true);
          window.setTimeout(function () {
            window.location.reload();
          }, 900);
        } else {
          showGenMsg(el, (res && res.error) || 'Restore failed', false);
        }
      })
      .catch(function () {
        showGenMsg(el, 'Restore request failed.', false);
      });
  }

  function clearLocalCaches() {
    var el = $('genClearMsg');
    if (
      !window.confirm(
        'Clear notification read-state and related keys in this browser only?'
      )
    )
      return;
    var keys = [
      'mnea_known_placement_submission_keys',
      'mnea_last_notif_total_dashboard',
      'mnea_admin_inquiries_cache'
    ];
    keys.forEach(function (k) {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
    showGenMsg(el, 'Local caches cleared. Notification counts may reset.', true);
  }

  function init() {
    if (!$('genSchoolName')) return;
    var save = $('genSaveSchool');
    if (save) save.addEventListener('click', saveGeneral);
    var bb = $('genBackupBtn');
    if (bb) bb.addEventListener('click', backup);
    var pick = $('genRestorePick');
    var finp = $('genRestoreFile');
    if (pick && finp) {
      pick.addEventListener('click', function () {
        finp.click();
      });
      finp.addEventListener('change', onRestoreFile);
    }
    var rb = $('genRestoreBtn');
    if (rb) rb.addEventListener('click', doRestore);
    var cl = $('genClearLocalBtn');
    if (cl) cl.addEventListener('click', clearLocalCaches);
    loadGeneral();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
