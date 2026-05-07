/**
 * Student extras (photo, notes) → web_extra student_profiles (keyed by student_id).
 */
(function () {
  'use strict';

  function findEntry(list, studentId) {
    var u = String(studentId || '').trim().toLowerCase();
    if (!u || !Array.isArray(list)) return -1;
    for (var i = 0; i < list.length; i++) {
      if (String((list[i] && list[i].student_id) || '').trim().toLowerCase() === u) return i;
    }
    return -1;
  }

  window.StudentProfileStore = {
    load: function (studentId, cb) {
      if (!window.SchoolAPI || !SchoolAPI.getWebExtra) {
        if (cb) cb(null);
        return;
      }
      SchoolAPI.getWebExtra('student_profiles').then(function (r) {
        var data = (r && r.ok && r.data) || [];
        var idx = findEntry(data, studentId);
        if (cb) cb(idx >= 0 ? data[idx] : null);
      });
    },

    save: function (studentId, payload, cb) {
      if (!window.SchoolAPI || !SchoolAPI.getWebExtra || !SchoolAPI.saveWebExtra) {
        if (cb) cb(false);
        return;
      }
      var u = String(studentId || '').trim();
      if (!u) {
        if (cb) cb(false);
        return;
      }
      SchoolAPI.getWebExtra('student_profiles')
        .then(function (r) {
          var data = (r && r.ok && r.data) || [];
          if (!Array.isArray(data)) data = [];
          var idx = findEntry(data, u);
          var row = Object.assign({ student_id: u, updated_at: new Date().toISOString() }, payload || {});
          if (idx >= 0) data[idx] = Object.assign({}, data[idx], row);
          else data.push(row);
          return SchoolAPI.saveWebExtra('student_profiles', data);
        })
        .then(function (r) {
          if (cb) cb(r && r.ok);
        })
        .catch(function () {
          if (cb) cb(false);
        });
    }
  };
})();
