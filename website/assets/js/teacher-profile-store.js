/**
 * Teacher professional profile → web_extra teacher_profiles (per school username).
 */
(function () {
  'use strict';

  function findEntry(list, username) {
    var u = String(username || '').trim().toLowerCase();
    if (!u || !Array.isArray(list)) return -1;
    for (var i = 0; i < list.length; i++) {
      if (String((list[i] && list[i].username) || '').trim().toLowerCase() === u) return i;
    }
    return -1;
  }

  window.TeacherProfileStore = {
    load: function (username, cb) {
      if (!window.SchoolAPI || !SchoolAPI.getWebExtra) {
        if (cb) cb(null);
        return;
      }
      SchoolAPI.getWebExtra('teacher_profiles').then(function (r) {
        var data = (r && r.ok && r.data) || [];
        var idx = findEntry(data, username);
        if (cb) cb(idx >= 0 ? data[idx] : null);
      });
    },

    save: function (username, payload, cb) {
      if (!window.SchoolAPI || !SchoolAPI.getWebExtra || !SchoolAPI.saveWebExtra) {
        if (cb) cb(false);
        return;
      }
      var u = String(username || '').trim();
      if (!u) {
        if (cb) cb(false);
        return;
      }
      SchoolAPI.getWebExtra('teacher_profiles')
        .then(function (r) {
          var data = (r && r.ok && r.data) || [];
          if (!Array.isArray(data)) data = [];
          var idx = findEntry(data, u);
          var row = Object.assign({ username: u, updated_at: new Date().toISOString() }, payload || {});
          if (idx >= 0) data[idx] = Object.assign({}, data[idx], row);
          else data.push(row);
          return SchoolAPI.saveWebExtra('teacher_profiles', data);
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
