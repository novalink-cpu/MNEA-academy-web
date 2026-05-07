/**
 * Teacher panel + SchoolAPI (app.py) — shared username storage and batch/student loads.
 * Username must match Academic → Batches → "Teacher login" and Flask teacher account.
 */
(function () {
  'use strict';

  var STORAGE = 'mnea_teacher_username';

  function weekDayLabel(d) {
    d = d || new Date();
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }

  window.TeacherSchool = {
    STORAGE_KEY: STORAGE,

    getUsername: function () {
      try {
        return (localStorage.getItem(STORAGE) || '').trim();
      } catch (e) {
        return '';
      }
    },

    setUsername: function (u) {
      u = (u || '').trim();
      try {
        localStorage.setItem(STORAGE, u);
      } catch (e) {}
      return u;
    },

    loadBatches: function () {
      var u = TeacherSchool.getUsername();
      if (!window.SchoolAPI || !SchoolAPI.getBatchesForTeacher) {
        return Promise.resolve({ ok: false, error: 'School API unavailable', batches: [] });
      }
      if (!u) return Promise.resolve({ ok: true, batches: [] });
      return SchoolAPI.getBatchesForTeacher(u);
    },

    /**
     * Students in all of this teacher's batches (unique student_id). Each row has _batch_name (primary batch label).
     */
    loadMyStudents: function () {
      return TeacherSchool.loadBatches().then(function (r) {
        if (!r || !r.ok) {
          return {
            ok: false,
            students: [],
            batches: [],
            error: (r && r.error) || 'Failed to load batches'
          };
        }
        var batches = r.batches || [];
        if (!batches.length) return { ok: true, students: [], batches: [] };
        if (!window.SchoolAPI || !SchoolAPI.getBatchStudents) {
          return { ok: false, students: [], batches: batches, error: 'getBatchStudents missing' };
        }
        return Promise.all(
          batches.map(function (b) {
            return SchoolAPI.getBatchStudents(b.id).then(function (res) {
              var studs = res && res.ok && Array.isArray(res.students) ? res.students : [];
              var bname =
                (res && res.batch && res.batch.name) || b.name || String(b.id);
              return studs.map(function (s) {
                var o = Object.assign({}, s);
                o._batch_id = b.id;
                o._batch_name = bname;
                return o;
              });
            });
          })
        ).then(function (groups) {
          var seen = Object.create(null);
          var out = [];
          groups.forEach(function (list) {
            list.forEach(function (s) {
              var id = s.student_id;
              if (!id || seen[id]) return;
              seen[id] = true;
              out.push(s);
            });
          });
          out.sort(function (a, b) {
            return (a.name || '')
              .toLowerCase()
              .localeCompare((b.name || '').toLowerCase());
          });
          return { ok: true, students: out, batches: batches };
        });
      });
    },

    /** Timetable rows today for teacher's batches only */
    loadTodayTimetableCount: function () {
      var day = weekDayLabel(new Date());
      return TeacherSchool.loadBatches().then(function (r) {
        if (!r || !r.ok || !(r.batches && r.batches.length)) {
          return { ok: !!(r && r.ok), count: 0, day: day };
        }
        var ids = {};
        r.batches.forEach(function (b) {
          ids[Number(b.id)] = true;
        });
        if (!window.SchoolAPI || !SchoolAPI.getBatchTimetables) {
          return { ok: false, count: 0, day: day };
        }
        return SchoolAPI.getBatchTimetables().then(function (tr) {
          var rows = tr && tr.ok && Array.isArray(tr.timetables) ? tr.timetables : [];
          var n = rows.filter(function (t) {
            return ids[Number(t.batch_id)] && String(t.day || '') === day;
          }).length;
          return { ok: true, count: n, day: day };
        });
      });
    },

    fillBatchSelect: function (selectEl, batches, placeholder) {
      if (!selectEl) return;
      var esc = function (s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      };
      var ph = placeholder || 'Select batch';
      var list = batches || [];
      selectEl.innerHTML =
        '<option value="">' + esc(ph) + '</option>' +
        list
          .map(function (b) {
            var id = b.id != null ? String(b.id) : '';
            var label =
              (b.name || id) +
              (b.schedule ? ' — ' + b.schedule : '') +
              (b.course_name ? ' · ' + b.course_name : '') +
              (b.level_name ? ' · ' + b.level_name : '');
            return '<option value="' + esc(id) + '">' + esc(label) + '</option>';
          })
          .join('');
    }
  };
})();
