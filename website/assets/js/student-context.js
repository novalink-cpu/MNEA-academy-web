/**
 * Resolve school student_id for API calls (attendance, marks, student record).
 * Session from auth.js sets profile.id to academic student_id after login.
 * Optional override: localStorage mnea_student_school_id (same key as UI may set).
 */
(function () {
  'use strict';

  var LS_KEY = 'mnea_student_school_id';

  window.StudentContext = {
    STORAGE_KEY: LS_KEY,

    getIdFromProfile: function (p) {
      try {
        var ov = (localStorage.getItem(LS_KEY) || '').trim();
        if (ov) return ov;
      } catch (e) {}
      return String((p && (p.id || p.username)) || '').trim();
    },

    resolve: function (cb) {
      var u = window.AcademyAuth && AcademyAuth.currentUser();
      if (!u || !AcademyAuth.getUserProfile) {
        if (cb) cb('');
        return;
      }
      AcademyAuth.getUserProfile(u.uid, function (p) {
        if (cb) cb(StudentContext.getIdFromProfile(p));
      });
    }
  };
})();
