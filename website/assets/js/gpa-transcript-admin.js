/**
 * Admin GPA & Transcript page — Program 8 UI: exam grid, official transcript, PDF, semester cards, cumulative.
 */
(function () {
  'use strict';

  var GE = window.GpaEngine;
  if (!GE) return;

  var DEMO_STUDENT = {
    id: 'demo-mgmg',
    student_id: 'STD-2026-001',
    name: 'Mg Mg',
    native_name: 'မောင်မောင်',
    batch_name: 'Grade 10-A',
    class: 'Grade 10-A'
  };

  var state = {
    students: [],
    records: [],
    schoolId: null,
    courses: [],
    selectedProgram: '__all__',
    selectedStudentId: '',
    academicYear: '',
    term: '',
    scaleId: 'us40pm'
  };

  /**
   * Pre-contract for future Exam Management integration.
   * Keep field names stable even before full module rollout.
   */
  var EXAM_IMPORT_MAPPING = {
    studentIdKeys: ['student_id', 'studentId', 'sid'],
    examKeyKeys: ['exam_key', 'examKey', 'subject', 'subject_code'],
    titleKeys: ['subject_name', 'subjectName', 'exam_name', 'examName', 'subject'],
    scorePriority: ['average', 'percentFromSubjects', 'grade'],
    creditsDefault: 1
  };

  var PROGRAM_8_FIXED = [
    { key: 'igcse', label: 'IGCSE', durationMonths: 24, aliases: ['igcse', 'i gcse'] },
    { key: 'preigcse', label: 'Pre-IGCSE', durationMonths: 12, aliases: ['pre igcse', 'pre-igcse'] },
    {
      key: 'globalprimary',
      label: 'Global Primary Learning Program',
      durationMonths: 60,
      aliases: ['global primary learning program', 'global primary']
    },
    {
      key: 'english4skills',
      label: 'English 4 Skills (PEIC, UK)',
      durationMonths: 6,
      aliases: ['english 4 skills', 'peic', 'english4skills']
    },
    {
      key: 'chinese',
      label: 'Chinese Language Program',
      durationMonths: 6,
      aliases: ['chinese language program', 'chinese']
    },
    {
      key: 'businessmanagement',
      label: 'Business & Management',
      durationMonths: 18,
      aliases: ['business management', 'business & management', 'business']
    },
    {
      key: 'codingrobotics',
      label: 'Coding & Robotics',
      durationMonths: 12,
      aliases: ['coding robotics', 'coding & robotics', 'robotics']
    },
    { key: 'onlineclass', label: 'Online Class', durationMonths: 3, aliases: ['online class', 'online'] }
  ];

  function canonicalProgramKey(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '');
  }

  function formatProgramDuration(months) {
    var n = Number(months || 0);
    if (!n) return '';
    if (n % 12 === 0) {
      var years = n / 12;
      return years + ' year' + (years > 1 ? 's' : '');
    }
    return n + ' month' + (n > 1 ? 's' : '');
  }

  function resolveProgramMeta(value) {
    var raw = String(value || '').trim();
    if (!raw || raw === '__all__') return null;
    var key = canonicalProgramKey(raw);
    for (var i = 0; i < PROGRAM_8_FIXED.length; i += 1) {
      var p = PROGRAM_8_FIXED[i];
      if (key === p.key) return p;
      var aliases = Array.isArray(p.aliases) ? p.aliases : [];
      for (var j = 0; j < aliases.length; j += 1) {
        if (key === canonicalProgramKey(aliases[j])) return p;
      }
    }
    return null;
  }

  function optionLabelFromProgramMeta(p) {
    var dur = formatProgramDuration(p && p.durationMonths);
    return dur ? p.label + ' (' + dur + ')' : p.label;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function loadSessionSchoolId() {
    try {
      var raw = localStorage.getItem('academy_session_v1');
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && s.school_id) || (s && s.schoolId) || null;
    } catch (e) {
      return null;
    }
  }

  function setStatus(msg, isErr) {
    var el = $('gpaStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'gpa-status' + (msg ? (isErr ? ' gpa-status--error' : ' gpa-status--ok') : '');
    el.style.display = msg ? 'block' : 'none';
  }

  function defaultCourses() {
    return [
      { courseCode: '', courseTitle: '', credits: 1, scoreInput: '' },
      { courseCode: '', courseTitle: '', credits: 1, scoreInput: '' },
      { courseCode: '', courseTitle: '', credits: 1, scoreInput: '' }
    ];
  }

  function studentLabel(s) {
    if (!s) return '';
    var name = s.name || s.student_name || '';
    var batch = s.batch_name || s.class || '';
    var id = String(s.id || s.student_id || '');
    if (batch) return name + ' - ' + batch;
    return name + (id ? ' (' + id + ')' : '');
  }

  function studentProgramLabel(s) {
    if (!s) return '';
    return String(
      s.program ||
        s.course ||
        s.course_name ||
        s.courseName ||
        s.grade ||
        s.program_name ||
        ''
    ).trim();
  }

  function getStudentById(id) {
    return state.students.find(function (s) {
      return String(s.id || s.student_id || '') === String(id);
    });
  }

  function firstNonEmpty(obj, keys) {
    var out = '';
    (keys || []).some(function (k) {
      if (!obj || obj[k] == null) return false;
      var v = String(obj[k]).trim();
      if (!v) return false;
      out = v;
      return true;
    });
    return out;
  }

  function getMappedStudentId(row) {
    return firstNonEmpty(row, EXAM_IMPORT_MAPPING.studentIdKeys);
  }

  function mapExamRowToProgramRow(book, row) {
    var classId = (book && (book.class_id || book.classId)) || '';
    var examKey =
      firstNonEmpty(book, EXAM_IMPORT_MAPPING.examKeyKeys) ||
      firstNonEmpty(row, EXAM_IMPORT_MAPPING.examKeyKeys) ||
      'Exam';
    var titleCore =
      firstNonEmpty(row, EXAM_IMPORT_MAPPING.titleKeys) ||
      firstNonEmpty(book, EXAM_IMPORT_MAPPING.titleKeys) ||
      examKey;

    var pct = GE.percentFromExamRow(row);
    var score = '';
    if (pct != null) score = String(Math.round(pct * 10) / 10);
    else if (row && row.grade != null && String(row.grade).trim()) score = String(row.grade).trim();
    if (!score) return null;

    return {
      sourceKey: String(examKey).toLowerCase().trim(),
      courseCode: String(examKey).slice(0, 32),
      courseTitle: (classId ? classId + ' · ' : '') + titleCore,
      credits: EXAM_IMPORT_MAPPING.creditsDefault,
      scoreInput: score
    };
  }

  function termSortKey(term) {
    var m = String(term || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 999;
  }

  function normalizeAcademicYear(y) {
    var raw = String(y == null ? '' : y).trim();
    if (!raw) return '';
    var one = raw.match(/^(\d{4})$/);
    if (one) {
      var a = parseInt(one[1], 10);
      return String(a) + '-' + String(a + 1);
    }
    var two = raw.match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (two) {
      return two[1] + '-' + two[2];
    }
    return raw;
  }

  function uniqueYearsFromRecords() {
    var y = {};
    (state.records || []).forEach(function (r) {
      var ny = normalizeAcademicYear(r.academic_year);
      if (ny) y[ny] = 1;
    });
    return Object.keys(y).sort();
  }

  function fillSelect(sel, options, current) {
    if (!sel) return;
    var cur = current != null ? String(current) : '';
    sel.innerHTML = '';
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    if (cur && Array.prototype.some.call(sel.options, function (x) { return x.value === cur; })) {
      sel.value = cur;
    }
  }

  function refreshYearTermSelects() {
    var years = uniqueYearsFromRecords();
    var cy = String(new Date().getFullYear());
    var defYear = cy + '-' + (parseInt(cy, 10) + 1);
    if (years.indexOf(defYear) < 0) years.push(defYear);
    years.sort();
    var currentNorm = normalizeAcademicYear(state.academicYear);
    if (years.indexOf(currentNorm) < 0 && currentNorm) years.push(currentNorm);
    years.sort();

    var yearOpts = years.map(function (y) {
      return { value: y, label: y };
    });
    if (!yearOpts.length) yearOpts.push({ value: defYear, label: defYear });

    var ySel = $('gpaAcademicYearSelect');
    var curY = normalizeAcademicYear(state.academicYear) || normalizeAcademicYear(ySel && ySel.value) || defYear;
    fillSelect(ySel, yearOpts, curY);
    state.academicYear = normalizeAcademicYear((ySel && ySel.value) || curY);

    var termsSeen = {};
    (state.records || []).forEach(function (r) {
      if (
        String(r.student_id) === String(state.selectedStudentId) &&
        normalizeAcademicYear(r.academic_year) === state.academicYear &&
        r.term
      ) {
        termsSeen[r.term] = 1;
      }
    });
    var termList = Object.keys(termsSeen);
    ['Term 1', 'Term 2', 'Term 3'].forEach(function (t) {
      if (termList.indexOf(t) < 0) termList.push(t);
    });
    termList.sort(function (a, b) {
      return termSortKey(a) - termSortKey(b);
    });
    var tSel = $('gpaTermSelect');
    var curT = state.term || (tSel && tSel.value) || 'Term 1';
    fillSelect(
      tSel,
      termList.map(function (t) {
        return { value: t, label: t };
      }),
      curT
    );
    state.term = (tSel && tSel.value) || curT;

    var allYears = uniqueYearsFromRecords();
    if (allYears.indexOf(defYear) < 0) allYears.push(defYear);
    allYears.sort();
    var yearOptsAll = [{ value: '__all__', label: 'All Years' }].concat(
      allYears.map(function (y) {
        return { value: y, label: y };
      })
    );
    fillSelect($('gpaCumYearRange'), yearOptsAll, $('gpaCumYearRange') && $('gpaCumYearRange').value);

    syncMirrorSelectOptions();
  }

  function syncMirrorSelectOptions() {
    var ids = ['gpaOfficialYear', 'gpaPdfYear', 'gpaSemYear'];
    var years = uniqueYearsFromRecords();
    var cy = String(new Date().getFullYear());
    var defYear = cy + '-' + (parseInt(cy, 10) + 1);
    if (years.indexOf(defYear) < 0) years.push(defYear);
    years.sort();
    var opts = years.map(function (y) {
      return { value: y, label: y };
    });
    ids.forEach(function (id) {
      var sel = $(id);
      var cur = sel && sel.value;
      fillSelect(sel, opts, cur || state.academicYear);
    });

    var tf = $('gpaSemTermFilter');
    if (tf) {
      var terms = ['__all__', 'Term 1', 'Term 2', 'Term 3'];
      var curTf = tf.value;
      tf.innerHTML = '';
      terms.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = t === '__all__' ? 'All Terms' : t;
        tf.appendChild(o);
      });
      if (curTf && Array.prototype.some.call(tf.options, function (x) { return x.value === curTf; })) tf.value = curTf;
    }
  }

  function mirrorStudentSelects(fromMain) {
    var main = $('gpaStudentSelect');
    if (!main) return;
    var val = fromMain != null ? fromMain : main.value;
    ;['gpaOfficialStudent', 'gpaPdfStudent', 'gpaSemStudent', 'gpaCumStudent'].forEach(function (id) {
      var s = $(id);
      if (!s) return;
      s.value = val;
    });
  }

  function mirrorProgramSelects(fromMain) {
    var main = $('gpaProgramSelect');
    if (!main) return;
    var val = fromMain != null ? fromMain : main.value || '__all__';
    ;['gpaOfficialProgram', 'gpaPdfProgram', 'gpaSemProgram', 'gpaCumProgram'].forEach(function (id) {
      var s = $(id);
      if (!s) return;
      s.value = val;
    });
    main.value = val;
  }

  function renderProgramDurationHint() {
    var out = $('gpaProgramDurationValue');
    if (!out) return;
    var selVal = state.selectedProgram || '__all__';
    if (selVal === '__all__') {
      out.textContent = 'All programs (mixed durations)';
      return;
    }
    var meta = resolveProgramMeta(selVal);
    if (!meta) {
      out.textContent = 'Custom program duration not set';
      return;
    }
    var dur = formatProgramDuration(meta.durationMonths);
    out.textContent = meta.label + (dur ? ' - ' + dur : '');
  }

  function rebuildProgramSelect() {
    var sel = $('gpaProgramSelect');
    if (!sel) return;
    var prev = state.selectedProgram || sel.value || '__all__';
    var catalog = [];
    if (window.SchoolAPI && Array.isArray(SchoolAPI.CANONICAL_PROGRAM_OPTIONS) && SchoolAPI.CANONICAL_PROGRAM_OPTIONS.length) {
      catalog = SchoolAPI.CANONICAL_PROGRAM_OPTIONS.map(function (name) {
        var meta = resolveProgramMeta(name);
        if (meta) return meta;
        return {
          key: canonicalProgramKey(name),
          label: String(name || '').trim(),
          durationMonths: 0,
          aliases: []
        };
      });
    } else {
      catalog = PROGRAM_8_FIXED.slice();
    }
    var seen = {};
    catalog = catalog.filter(function (p) {
      var k = String(p && p.key ? p.key : '').trim();
      if (!k || seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    var opts = [{ value: '__all__', label: 'All programs' }].concat(
      catalog.map(function (p) {
        return { value: p.key, label: optionLabelFromProgramMeta(p) };
      })
    );
    ['gpaProgramSelect', 'gpaOfficialProgram', 'gpaPdfProgram', 'gpaSemProgram', 'gpaCumProgram'].forEach(function (id) {
      var x = $(id);
      var cur = x && x.value ? x.value : prev;
      fillSelect(x, opts, cur);
    });
    state.selectedProgram = Array.prototype.some.call(sel.options, function (x) {
      return x.value === prev;
    })
      ? prev
      : '__all__';
    mirrorProgramSelects(state.selectedProgram);
    renderProgramDurationHint();
  }

  function filteredStudentsByProgram() {
    var p = (state.selectedProgram || '__all__').trim();
    if (!p || p === '__all__') return state.students.slice();
    return (state.students || []).filter(function (s) {
      var meta = resolveProgramMeta(studentProgramLabel(s));
      if (meta) return meta.key === p;
      return canonicalProgramKey(studentProgramLabel(s)) === canonicalProgramKey(p);
    });
  }

  function rebuildStudentSelects() {
    var list = filteredStudentsByProgram();
    var htmlBuild = function (sel, withPlaceholder) {
      if (!sel) return;
      sel.innerHTML = withPlaceholder ? '<option value="">— Select student —</option>' : '';
      list.forEach(function (s) {
        var id = String(s.id || s.student_id || '');
        if (!id) return;
        var o = document.createElement('option');
        o.value = id;
        o.textContent = studentLabel(s);
        sel.appendChild(o);
      });
    };
    htmlBuild($('gpaStudentSelect'), true);
    htmlBuild($('gpaOfficialStudent'), true);
    htmlBuild($('gpaPdfStudent'), true);
    htmlBuild($('gpaSemStudent'), true);
    htmlBuild($('gpaCumStudent'), true);
    if (state.selectedStudentId && $('gpaStudentSelect')) {
      var keep = Array.prototype.some.call($('gpaStudentSelect').options, function (o) {
        return o.value === String(state.selectedStudentId);
      });
      $('gpaStudentSelect').value = keep ? state.selectedStudentId : '';
      if (!keep) state.selectedStudentId = '';
    }
    mirrorStudentSelects(state.selectedStudentId);
  }

  function updateCumulativeDisplay() {
    readFilters();
    var sid = state.selectedStudentId;
    var hintVal = $('gpaCumulativeHintVal');

    if (!sid) {
      if (hintVal) hintVal.textContent = '—';
      return;
    }

    var recs = (state.records || []).filter(function (r) {
      return String(r.student_id) === String(sid);
    });

    if (!recs.length) {
      if (hintVal) hintVal.textContent = '—';
      return;
    }

    var pooled = [];
    recs.forEach(function (r) {
      var sc = r.scale_id || 'us40pm';
      (r.courses || []).forEach(function (c) {
        pooled.push({
          courseCode: c.courseCode,
          courseTitle: c.courseTitle,
          credits: c.credits,
          scoreInput: c.scoreInput,
          scaleId: sc
        });
      });
    });

    var res = GE.computeGPA(pooled, null);
    if (hintVal) hintVal.textContent = res.gpa != null ? res.gpa.toFixed(2) : '—';

    renderOfficialTable();
    renderSemesterCards();
    renderCumulativePanel();
  }

  function renderCourseRows() {
    var tb = $('gpaCourseBody');
    if (!tb) return;
    tb.innerHTML = '';
    var scale = state.scaleId;
    var result = GE.computeGPA(
      state.courses.map(function (c) {
        return {
          courseCode: c.courseCode,
          courseTitle: c.courseTitle,
          credits: c.credits,
          scoreInput: c.scoreInput,
          scaleId: scale
        };
      }),
      scale
    );

    state.courses.forEach(function (c, i) {
      var det = result.rows[i] || {};
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><input type="text" class="gpa-inp" data-f="code" data-i="' +
        i +
        '" placeholder="e.g. ENG101" value="' +
        esc(c.courseCode) +
        '"></td>' +
        '<td><input type="text" class="gpa-inp" data-f="title" data-i="' +
        i +
        '" placeholder="English 101" value="' +
        esc(c.courseTitle) +
        '"></td>' +
        '<td><input type="number" class="gpa-inp gpa-inp--num" data-f="credits" data-i="' +
        i +
        '" min="0" step="0.5" value="' +
        esc(c.credits) +
        '"></td>' +
        '<td><input type="text" class="gpa-inp" data-f="score" data-i="' +
        i +
        '" placeholder="85 or A*" value="' +
        esc(c.scoreInput) +
        '"></td>' +
        '<td class="gpa-cell-muted">' +
        esc(det.letter || '—') +
        '</td>' +
        '<td class="gpa-cell-gp">' +
        (det.gradePoint != null ? det.gradePoint.toFixed(2) : '—') +
        '</td>' +
        '<td><button type="button" class="btn-icon-del" data-del="' +
        i +
        '" title="Remove row">&#x1F5D1;</button></td>';
      tb.appendChild(tr);
    });

    var gpaEl = $('gpaResultValue');
    if (gpaEl) {
      gpaEl.textContent = result.gpa != null ? result.gpa.toFixed(2) : '0.00';
    }

    tb.querySelectorAll('.gpa-inp').forEach(function (inp) {
      inp.addEventListener('change', onCellChange);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          inp.blur();
        }
      });
    });
    tb.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-del'), 10);
        if (!isNaN(idx)) {
          state.courses.splice(idx, 1);
          if (!state.courses.length) state.courses = defaultCourses();
          renderCourseRows();
        }
      });
    });

    updateCumulativeDisplay();
  }

  function onCellChange() {
    var inp = this;
    var i = parseInt(inp.getAttribute('data-i'), 10);
    var f = inp.getAttribute('data-f');
    if (isNaN(i) || !state.courses[i]) return;
    if (f === 'code') state.courses[i].courseCode = inp.value;
    else if (f === 'title') state.courses[i].courseTitle = inp.value;
    else if (f === 'credits') state.courses[i].credits = parseFloat(inp.value) || 0;
    else if (f === 'score') state.courses[i].scoreInput = inp.value;
    renderCourseRows();
  }

  function readFilters() {
    state.selectedProgram = ($('gpaProgramSelect') && $('gpaProgramSelect').value) || '__all__';
    state.selectedStudentId = ($('gpaStudentSelect') && $('gpaStudentSelect').value) || '';
    state.academicYear = normalizeAcademicYear(
      ($('gpaAcademicYearSelect') && $('gpaAcademicYearSelect').value.trim()) || ''
    );
    state.term = ($('gpaTermSelect') && $('gpaTermSelect').value.trim()) || '';
    state.scaleId = ($('gpaScale') && $('gpaScale').value) || 'us40pm';
    renderProgramDurationHint();
  }

  function applyRecordToUI(rec) {
    if (!rec) {
      state.courses = defaultCourses();
      return;
    }
    state.academicYear = normalizeAcademicYear(rec.academic_year || '');
    state.term = rec.term || '';
    state.scaleId = rec.scale_id || 'us40pm';
    if ($('gpaAcademicYearSelect')) $('gpaAcademicYearSelect').value = state.academicYear;
    if ($('gpaTermSelect')) $('gpaTermSelect').value = state.term;
    if ($('gpaScale')) $('gpaScale').value = state.scaleId;
    state.courses =
      Array.isArray(rec.courses) && rec.courses.length
        ? rec.courses.map(function (c) {
            return {
              courseCode: c.courseCode || '',
              courseTitle: c.courseTitle || '',
              credits: c.credits != null ? c.credits : 1,
              scoreInput: c.scoreInput != null ? String(c.scoreInput) : ''
            };
          })
        : defaultCourses();
  }

  function buildCurrentRecord() {
    readFilters();
    var st = getStudentById(state.selectedStudentId);
    return {
      student_id: state.selectedStudentId,
      student_name: st ? st.name || st.student_name || '' : '',
      academic_year: normalizeAcademicYear(state.academicYear),
      term: state.term,
      scale_id: state.scaleId,
      courses: state.courses.map(function (c) {
        return {
          courseCode: c.courseCode,
          courseTitle: c.courseTitle,
          credits: c.credits,
          scoreInput: c.scoreInput
        };
      }),
      updated_at: new Date().toISOString()
    };
  }

  function mergeRecordIntoList(rec) {
    var list = state.records.slice();
    var key = rec.student_id + '|' + rec.academic_year + '|' + rec.term;
    var idx = list.findIndex(function (r) {
      return r.student_id + '|' + r.academic_year + '|' + r.term === key;
    });
    if (idx >= 0) list[idx] = rec;
    else list.push(rec);
    return list;
  }

  function saveRecord() {
    readFilters();
    if (!state.selectedStudentId) {
      setStatus('Select a student first.', true);
      return;
    }
    var rec = buildCurrentRecord();
    if (!window.SchoolAPI || !SchoolAPI.saveGpaTranscriptRecords) {
      try {
        localStorage.setItem('gpa_transcript_local_v1', JSON.stringify(mergeRecordIntoList(rec)));
        state.records = mergeRecordIntoList(rec);
        setStatus('Saved locally (backend not used).');
        refreshYearTermSelects();
        updateCumulativeDisplay();
      } catch (e) {
        setStatus('Could not save.', true);
      }
      return;
    }
    var list = mergeRecordIntoList(rec);
    SchoolAPI.saveGpaTranscriptRecords(list, state.schoolId).then(function (r) {
      if (r && r.ok) {
        state.records = list;
        setStatus('Saved to school records (gpa_transcript_records).');
      } else {
        try {
          localStorage.setItem('gpa_transcript_local_v1', JSON.stringify(list));
          state.records = list;
          setStatus('API save failed; backup saved in browser local storage.', true);
        } catch (e2) {
          setStatus((r && r.error) || 'Save failed.', true);
        }
      }
      refreshYearTermSelects();
      updateCumulativeDisplay();
    });
  }

  function loadRecordsFromApi(cb) {
    if (!window.SchoolAPI || !SchoolAPI.getGpaTranscriptRecords) {
      try {
        var loc = localStorage.getItem('gpa_transcript_local_v1');
        state.records = loc ? JSON.parse(loc) : [];
      } catch (e) {
        state.records = [];
      }
      if (cb) cb();
      return;
    }
    SchoolAPI.getGpaTranscriptRecords(state.schoolId).then(function (list) {
      state.records = Array.isArray(list) ? list : [];
      if (!state.records.length) {
        try {
          var loc2 = localStorage.getItem('gpa_transcript_local_v1');
          if (loc2) state.records = JSON.parse(loc2) || [];
        } catch (e2) {}
      }
      if (cb) cb();
    });
  }

  function loadStudents(cb) {
    if (!window.SchoolAPI || !SchoolAPI.getStudents) {
      state.students = [DEMO_STUDENT];
      rebuildProgramSelect();
      rebuildStudentSelects();
      if (cb) cb();
      return;
    }
    SchoolAPI.getStudents(state.schoolId).then(function (r) {
      var list = [];
      if (r && r.ok && Array.isArray(r.students)) list = r.students;
      else if (r && r.students && Array.isArray(r.students)) list = r.students;
      else if (r && r.ok && Array.isArray(r.data)) list = r.data;
      if (!list.length) list = [DEMO_STUDENT];
      state.students = list;
      rebuildProgramSelect();
      rebuildStudentSelects();
      if (cb) cb();
    });
  }

  function findRecordForSelection() {
    readFilters();
    var key = state.selectedStudentId + '|' + state.academicYear + '|' + state.term;
    return state.records.find(function (r) {
      return r.student_id + '|' + normalizeAcademicYear(r.academic_year) + '|' + r.term === key;
    });
  }

  function onStudentOrTermChange() {
    readFilters();
    state.selectedStudentId = ($('gpaStudentSelect') && $('gpaStudentSelect').value) || '';
    mirrorStudentSelects();
    var rec = findRecordForSelection();
    applyRecordToUI(rec);
    refreshYearTermSelects();
    renderCourseRows();
  }

  function addRow() {
    readFilters();
    state.courses.push({ courseCode: '', courseTitle: '', credits: 1, scoreInput: '' });
    renderCourseRows();
  }

  function newCourseSheet() {
    readFilters();
    state.courses = defaultCourses();
    renderCourseRows();
    setStatus('New blank program rows.');
  }

  function importFromExamMarks() {
    readFilters();
    if (!state.selectedStudentId) {
      setStatus('Select a student to import exam results.', true);
      return;
    }
    if (!window.SchoolAPI || !SchoolAPI.getAllExamMarks) {
      setStatus('School API unavailable.', true);
      return;
    }
    SchoolAPI.getAllExamMarks(state.schoolId).then(function (books) {
      var sid = String(state.selectedStudentId);
      var added = [];
      (books || []).forEach(function (book) {
        var rows = book.rows || [];
        rows.forEach(function (row) {
          var rid = String(getMappedStudentId(row));
          if (rid !== sid) return;
          var mapped = mapExamRowToProgramRow(book, row);
          if (!mapped) return;
          added.push(mapped);
        });
      });
      if (!added.length) {
        setStatus('No exam marks found for this student.', true);
        return;
      }
      state.courses = state.courses.filter(function (c) {
        return c.scoreInput || c.courseTitle || c.courseCode;
      });
      if (!state.courses.length) state.courses = [];
      // Merge by source exam key (or fallback by program code) to avoid duplicate imports.
      var existingByKey = {};
      state.courses.forEach(function (c) {
        var k = String((c.courseCode || '')).toLowerCase().trim();
        if (k) existingByKey[k] = c;
      });
      added.forEach(function (a) {
        var k = a.sourceKey || String((a.courseCode || '')).toLowerCase().trim();
        if (k && existingByKey[k]) {
          existingByKey[k].courseTitle = a.courseTitle || existingByKey[k].courseTitle;
          existingByKey[k].scoreInput = a.scoreInput || existingByKey[k].scoreInput;
          if (!existingByKey[k].credits) existingByKey[k].credits = a.credits;
        } else {
          state.courses.push({
            courseCode: a.courseCode,
            courseTitle: a.courseTitle,
            credits: a.credits,
            scoreInput: a.scoreInput
          });
        }
      });
      renderCourseRows();
      setStatus('Imported ' + added.length + ' row(s). Review credits and scale.');
    });
  }

  function printSummaryHtml(title, innerBody) {
    var w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
        esc(title) +
        '</title>' +
        '<style>body{font-family:Segoe UI,system-ui,sans-serif;padding:1.5rem;color:#0f172a;}table{border-collapse:collapse;width:100%;max-width:900px;}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;}th{background:#e0f2fe;}h1{font-size:1.25rem;}</style></head><body>' +
        innerBody +
        '</body></html>'
    );
    w.document.close();
    w.focus();
    w.print();
  }

  function printSummary() {
    readFilters();
    var rec = buildCurrentRecord();
    var res = GE.computeGPA(
      rec.courses.map(function (c) {
        return Object.assign({}, c, { scaleId: rec.scale_id });
      }),
      rec.scale_id
    );
    var rowsHtml = res.rows
      .map(function (d) {
        return (
          '<tr><td>' +
          esc(d.courseCode) +
          '</td><td>' +
          esc(d.courseTitle) +
          '</td><td>' +
          esc(d.credits) +
          '</td><td>' +
          esc(state.courses[d.index] && state.courses[d.index].scoreInput) +
          '</td><td>' +
          esc(d.letter) +
          '</td><td>' +
          (d.gradePoint != null ? d.gradePoint.toFixed(2) : '—') +
          '</td></tr>'
        );
      })
      .join('');
    printSummaryHtml(
      'GPA Summary',
      '<h1>GPA summary</h1>' +
        '<p><strong>Student:</strong> ' +
        esc(rec.student_name) +
        ' · <strong>ID:</strong> ' +
        esc(rec.student_id) +
        '</p>' +
        '<p><strong>Year / Term:</strong> ' +
        esc(rec.academic_year) +
        ' / ' +
        esc(rec.term) +
        ' · <strong>Scale:</strong> ' +
        esc(rec.scale_id) +
        '</p>' +
        '<p><strong>GPA:</strong> ' +
        (res.gpa != null ? res.gpa.toFixed(3) : '—') +
        '</p>' +
        '<table><thead><tr><th>Code</th><th>Program</th><th>Credits</th><th>Score</th><th>Letter</th><th>GP</th></tr></thead><tbody>' +
        rowsHtml +
        '</tbody></table>'
    );
  }

  function officialRecordFromSelectors() {
    var sid = ($('gpaOfficialStudent') && $('gpaOfficialStudent').value) || '';
    var year = ($('gpaOfficialYear') && $('gpaOfficialYear').value) || '';
    if (!sid || !year) return null;
    var recs = (state.records || []).filter(function (r) {
      return String(r.student_id) === String(sid) && r.academic_year === year;
    });
    if (!recs.length) return null;
    recs.sort(function (a, b) {
      return termSortKey(a.term) - termSortKey(b.term);
    });
    var chosen = recs[0];
    readFilters();
    if (String(sid) === String(state.selectedStudentId) && year === state.academicYear && state.term) {
      var match = recs.find(function (r) {
        return r.term === state.term;
      });
      if (match) chosen = match;
    }
    var scale = chosen.scale_id || 'us40pm';
    var courses = (chosen.courses || []).map(function (c) {
      return Object.assign({}, c, { scaleId: scale });
    });
    return {
      student: getStudentById(sid),
      student_id: sid,
      academic_year: year,
      term: chosen.term,
      courses: courses,
      scale_id: scale
    };
  }

  function renderOfficialStudentCard() {
    var sid = ($('gpaOfficialStudent') && $('gpaOfficialStudent').value) || '';
    var year = ($('gpaOfficialYear') && $('gpaOfficialYear').value) || '';
    var st = getStudentById(sid);
    if ($('gpaOffName'))
      $('gpaOffName').textContent = st
        ? (st.name || st.student_name || '—') + (st.native_name ? ' (' + st.native_name + ')' : '')
        : '—';
    if ($('gpaOffId')) $('gpaOffId').textContent = st ? st.student_id || st.id || '—' : '—';
    if ($('gpaOffBatch')) $('gpaOffBatch').textContent = st ? st.batch_name || st.class || '—' : '—';
    if ($('gpaOffYear')) $('gpaOffYear').textContent = year || '—';
  }

  function renderOfficialTable() {
    renderOfficialStudentCard();
    var tb = $('gpaOfficialBody');
    if (!tb) return;
    tb.innerHTML = '';

    var useLive = $('gpaOfficialStudent') && $('gpaOfficialYear') &&
      $('gpaOfficialStudent').value === state.selectedStudentId &&
      $('gpaOfficialYear').value === state.academicYear;

    var res;
    var coursesPayload;
    var scaleId;

    if (useLive && state.courses.some(function (c) { return c.scoreInput || c.courseCode || c.courseTitle; })) {
      scaleId = state.scaleId;
      coursesPayload = state.courses.map(function (c) {
        return Object.assign({}, c, { scaleId: scaleId });
      });
      res = GE.computeGPA(coursesPayload, scaleId);
    } else {
      var pack = officialRecordFromSelectors();
      if (!pack || !pack.courses.length) {
        tb.innerHTML =
          '<tr><td colspan="5" class="gpa-cell-muted">No saved transcript for this student and year. Enter programs above and save, or pick another year.</td></tr>';
        return;
      }
      scaleId = pack.scale_id;
      coursesPayload = pack.courses;
      res = GE.computeGPA(coursesPayload, scaleId);
    }

    res.rows.forEach(function (d, idx) {
      var c = coursesPayload[idx] || {};
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        esc(c.courseCode || d.courseCode) +
        '</td><td>' +
        esc(c.courseTitle || d.courseTitle) +
        '</td><td>' +
        esc(c.credits != null ? c.credits : d.credits) +
        '</td><td>' +
        esc(d.letter || '—') +
        '</td><td>' +
        (d.gradePoint != null ? d.gradePoint.toFixed(2) : '—') +
        '</td>';
      tb.appendChild(tr);
    });

    var sumCr = res.sumCredits;
    var trFoot = document.createElement('tr');
    trFoot.className = 'gpa-term-row';
    trFoot.innerHTML =
      '<td colspan="2">TERM GPA</td><td>' +
      (sumCr || '—') +
      '</td><td></td><td>' +
      (res.gpa != null ? res.gpa.toFixed(2) : '—') +
      '</td>';
    tb.appendChild(trFoot);
  }

  function printOfficialTranscript() {
    var sid = ($('gpaOfficialStudent') && $('gpaOfficialStudent').value) || '';
    var st = getStudentById(sid);
    var year = ($('gpaOfficialYear') && $('gpaOfficialYear').value) || '';
    var tb = $('gpaOfficialBody');
    if (!tb) return;
    printSummaryHtml(
      'Official Transcript',
      '<h1 style="text-align:center">OFFICIAL TRANSCRIPT</h1>' +
        '<p><strong>' +
        esc(st && (st.name || st.student_name)) +
        '</strong> · ID ' +
        esc(st && (st.student_id || st.id)) +
        ' · ' +
        esc(year) +
        '</p>' +
        '<table><thead><tr><th>Code</th><th>Program</th><th>Credits</th><th>Grade</th><th>GP</th></tr></thead><tbody>' +
        tb.innerHTML +
        '</tbody></table>'
    );
  }

  function buildPdfOrExportBody() {
    var sid = ($('gpaPdfStudent') && $('gpaPdfStudent').value) || '';
    var year = ($('gpaPdfYear') && $('gpaPdfYear').value) || '';
    var st = getStudentById(sid);
    var optInfo = $('gpaPdfOptInfo') && $('gpaPdfOptInfo').checked;
    var optTerms = $('gpaPdfOptTerms') && $('gpaPdfOptTerms').checked;
    var optCum = $('gpaPdfOptCum') && $('gpaPdfOptCum').checked;
    var optLh = $('gpaPdfOptLetterhead') && $('gpaPdfOptLetterhead').checked;

    var parts = [];
    if (optLh) parts.push('<p style="border-bottom:2px solid #0d9488;padding-bottom:8px;"><strong>MYANMAR NEW ERA ACADEMY</strong><br><span style="font-size:0.9rem;">Official transcript (summary)</span></p>');
    if (optInfo && st) {
      parts.push(
        '<p><strong>Student:</strong> ' +
          esc(st.name || st.student_name) +
          (st.native_name ? ' (' + esc(st.native_name) + ')' : '') +
          '<br><strong>ID:</strong> ' +
          esc(st.student_id || st.id) +
          '<br><strong>Batch:</strong> ' +
          esc(st.batch_name || st.class || '') +
          '</p>'
      );
    }
    parts.push('<p><strong>Academic year:</strong> ' + esc(year) + '</p>');

    var recs = (state.records || []).filter(function (r) {
      return String(r.student_id) === String(sid) && r.academic_year === year;
    });
    recs.sort(function (a, b) {
      return termSortKey(a.term) - termSortKey(b.term);
    });

    if (optTerms && recs.length) {
      recs.forEach(function (r) {
        var res = GE.computeGPA(
          (r.courses || []).map(function (c) {
            return Object.assign({}, c, { scaleId: r.scale_id });
          }),
          r.scale_id
        );
        var rows = res.rows
          .map(function (d) {
            return (
              '<tr><td>' +
              esc(d.courseCode) +
              '</td><td>' +
              esc(d.courseTitle) +
              '</td><td>' +
              esc(d.credits) +
              '</td><td>' +
              esc(d.letter) +
              '</td><td>' +
              (d.gradePoint != null ? d.gradePoint.toFixed(2) : '—') +
              '</td></tr>'
            );
          })
          .join('');
        parts.push(
          '<h2 style="font-size:1rem;margin-top:1rem;">' +
            esc(r.term) +
            '</h2><table><thead><tr><th>Code</th><th>Program</th><th>Credits</th><th>Grade</th><th>GP</th></tr></thead><tbody>' +
            rows +
            '</tbody></table><p><strong>Term GPA:</strong> ' +
            (res.gpa != null ? res.gpa.toFixed(3) : '—') +
            '</p>'
        );
      });
    } else {
      var single = recs[0];
      if (single) {
        var res2 = GE.computeGPA(
          (single.courses || []).map(function (c) {
            return Object.assign({}, c, { scaleId: single.scale_id });
          }),
          single.scale_id
        );
        var rows2 = res2.rows
          .map(function (d) {
            return (
              '<tr><td>' +
              esc(d.courseCode) +
              '</td><td>' +
              esc(d.courseTitle) +
              '</td><td>' +
              esc(d.credits) +
              '</td><td>' +
              esc(d.letter) +
              '</td><td>' +
              (d.gradePoint != null ? d.gradePoint.toFixed(2) : '—') +
              '</td></tr>'
            );
          })
          .join('');
        parts.push(
          '<table><thead><tr><th>Code</th><th>Program</th><th>Credits</th><th>Grade</th><th>GP</th></tr></thead><tbody>' +
            rows2 +
            '</tbody></table><p><strong>Term GPA:</strong> ' +
            (res2.gpa != null ? res2.gpa.toFixed(3) : '—') +
            '</p>'
        );
      }
    }

    if (optCum) {
      var all = (state.records || []).filter(function (r) {
        return String(r.student_id) === String(sid);
      });
      var pool = [];
      all.forEach(function (r) {
        var sc = r.scale_id || 'us40pm';
        (r.courses || []).forEach(function (c) {
          pool.push(Object.assign({}, c, { scaleId: sc }));
        });
      });
      var cum = GE.computeGPA(pool, null);
      parts.push('<p><strong>Cumulative GPA (all saved terms):</strong> ' + (cum.gpa != null ? cum.gpa.toFixed(3) : '—') + '</p>');
    }

    return parts.join('');
  }

  function downloadPdfTranscript() {
    var body = buildPdfOrExportBody();
    if (!body) {
      setStatus('Choose student and year with saved data for PDF.', true);
      return;
    }
    printSummaryHtml('Transcript PDF', body);
  }

  function renderSemesterCards() {
    var host = $('gpaSemesterCards');
    if (!host) return;
    var sid = ($('gpaSemStudent') && $('gpaSemStudent').value) || '';
    var year = ($('gpaSemYear') && $('gpaSemYear').value) || '';
    var termFilter = ($('gpaSemTermFilter') && $('gpaSemTermFilter').value) || '__all__';
    host.innerHTML = '';

    if (!sid || !year) {
      host.innerHTML = '<p class="gpa-cell-muted">Select student and academic year.</p>';
      return;
    }

    var recs = (state.records || []).filter(function (r) {
      return String(r.student_id) === String(sid) && r.academic_year === year;
    });
    recs.sort(function (a, b) {
      return termSortKey(a.term) - termSortKey(b.term);
    });

    if (termFilter !== '__all__') {
      recs = recs.filter(function (r) {
        return r.term === termFilter;
      });
    }

    function cardHtml(r, completed, gpa, creds, nCourses) {
      var idle = !completed;
      return (
        '<div class="gpa-sem-card' +
        (idle ? ' gpa-sem-card--idle' : '') +
        '"><div class="gpa-sem-card-head"><h4>' +
        esc(r.term) +
        ' - ' +
        esc(year) +
        '</h4><div><span style="font-size:0.75rem;color:#64748b;">Term GPA</span><div style="font-size:1.65rem;font-weight:800;color:' +
        (idle ? '#94a3b8' : '#831843') +
        ';">' +
        (gpa != null ? gpa.toFixed(2) : '—') +
        '</div></div></div><div class="gpa-sem-meta"><span>Total Credits <strong>' +
        (creds != null ? creds : '—') +
        '</strong></span><span>Programs <strong>' +
        (nCourses != null ? nCourses : '—') +
        '</strong></span><span>Status <strong>' +
        (completed ? 'Completed' : 'In Progress') +
        '</strong></span></div></div>'
      );
    }

    if (!recs.length) {
      ['Term 1', 'Term 2', 'Term 3'].forEach(function (t, idx) {
        if (termFilter !== '__all__' && termFilter !== t) return;
        var completed = false;
        host.insertAdjacentHTML(
          'beforeend',
          cardHtml({ term: t }, completed, null, null, null)
        );
      });
      return;
    }

    recs.forEach(function (r) {
      var res = GE.computeGPA(
        (r.courses || []).map(function (c) {
          return Object.assign({}, c, { scaleId: r.scale_id });
        }),
        r.scale_id
      );
      var n = (r.courses || []).filter(function (c) {
        return c.scoreInput || c.courseCode || c.courseTitle;
      }).length;
      var completed = n > 0 && res.gpa != null;
      host.insertAdjacentHTML('beforeend', cardHtml(r, completed, res.gpa, res.sumCredits, n));
    });

    if (termFilter === '__all__') {
      var maxT = 0;
      recs.forEach(function (r) {
        var k = termSortKey(r.term);
        if (k > maxT) maxT = k;
      });
      if (maxT > 0 && maxT < 3) {
        var next = 'Term ' + (maxT + 1);
        if (!recs.some(function (x) { return x.term === next; })) {
          host.insertAdjacentHTML('beforeend', cardHtml({ term: next }, false, null, null, null));
        }
      }
    }
  }

  function renderCumulativePanel() {
    var sid = ($('gpaCumStudent') && $('gpaCumStudent').value) || '';
    var yrRange = ($('gpaCumYearRange') && $('gpaCumYearRange').value) || '__all__';
    var tb = $('gpaCumTableBody');
    if (tb) tb.innerHTML = '';

    if (!sid) {
      if ($('gpaCumHeroVal')) $('gpaCumHeroVal').textContent = '—';
      if ($('gpaCumTotCred')) $('gpaCumTotCred').textContent = '—';
      if ($('gpaCumTermsDone')) $('gpaCumTermsDone').textContent = '—';
      if ($('gpaCumCourses')) $('gpaCumCourses').textContent = '—';
      return;
    }

    var recs = (state.records || []).filter(function (r) {
      return String(r.student_id) === String(sid);
    });
    if (yrRange !== '__all__') {
      recs = recs.filter(function (r) {
        return r.academic_year === yrRange;
      });
    }
    recs.sort(function (a, b) {
      var ya = String(a.academic_year || '');
      var yb = String(b.academic_year || '');
      if (ya !== yb) return ya.localeCompare(yb);
      return termSortKey(a.term) - termSortKey(b.term);
    });

    var pooled = [];
    var totalPrograms = 0;
    recs.forEach(function (r) {
      totalPrograms += (r.courses || []).length;
    });

    var rowsOut = [];
    recs.forEach(function (r) {
      var sc = r.scale_id || 'us40pm';
      (r.courses || []).forEach(function (c) {
        pooled.push({
          courseCode: c.courseCode,
          courseTitle: c.courseTitle,
          credits: c.credits,
          scoreInput: c.scoreInput,
          scaleId: sc
        });
      });
      var termRes = GE.computeGPA(
        (r.courses || []).map(function (c) {
          return Object.assign({}, c, { scaleId: sc });
        }),
        sc
      );
      var cumRes = GE.computeGPA(pooled.slice(), null);
      rowsOut.push({
        label: r.term + ' - ' + r.academic_year,
        credits: termRes.sumCredits,
        termGpa: termRes.gpa,
        cumGpa: cumRes.gpa
      });
    });

    var finalCum = GE.computeGPA(pooled, null);
    if ($('gpaCumHeroVal')) $('gpaCumHeroVal').textContent = finalCum.gpa != null ? finalCum.gpa.toFixed(2) : '—';
    if ($('gpaCumTotCred')) $('gpaCumTotCred').textContent = finalCum.sumCredits > 0 ? String(finalCum.sumCredits) : '—';
    if ($('gpaCumTermsDone')) $('gpaCumTermsDone').textContent = String(recs.length);
    if ($('gpaCumCourses')) $('gpaCumCourses').textContent = String(totalPrograms);

    rowsOut.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        esc(row.label) +
        '</td><td>' +
        (row.credits != null ? esc(row.credits) : '—') +
        '</td><td>' +
        (row.termGpa != null ? row.termGpa.toFixed(2) : '—') +
        '</td><td>' +
        (row.cumGpa != null ? row.cumGpa.toFixed(2) : '—') +
        '</td>';
      tb.appendChild(tr);
    });
  }

  function exportCumulativeReport() {
    var sid = ($('gpaCumStudent') && $('gpaCumStudent').value) || '';
    var st = getStudentById(sid);
    var tb = $('gpaCumTableBody');
    printSummaryHtml(
      'Cumulative GPA Report',
      '<h1>Cumulative GPA report</h1><p><strong>Student:</strong> ' +
        esc(st && (st.name || st.student_name)) +
        '</p>' +
        '<table><thead><tr><th>Term</th><th>Credits</th><th>Term GPA</th><th>Cumulative GPA</th></tr></thead><tbody>' +
        (tb ? tb.innerHTML : '') +
        '</tbody></table>'
    );
  }

  var GPA_PANEL_MAP = {
    auto: 'gpaPanelAuto',
    transcript: 'gpaPanelTranscript',
    pdf: 'gpaPanelPdf',
    semester: 'gpaPanelSemester',
    cumulative: 'gpaPanelCumulative'
  };

  /** One stat card = one full panel visible (Program 8). */
  function showGpaPanel(key) {
    key = String(key || '').trim();
    if (!GPA_PANEL_MAP[key]) return;

    document.querySelectorAll('.gpa-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.id === GPA_PANEL_MAP[key]);
    });

    document.querySelectorAll('.gpa-stat-card[data-gpa-panel]').forEach(function (card) {
      var k = card.getAttribute('data-gpa-panel') || '';
      var on = k === key;
      card.classList.toggle('is-active-card', on);
      card.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    if (key === 'semester') renderSemesterCards();
    if (key === 'cumulative') renderCumulativePanel();
    if (key === 'transcript') renderOfficialTable();
  }

  function bindStatCards() {
    document.querySelectorAll('.gpa-stat-card[data-gpa-panel]').forEach(function (card) {
      function activate(ev) {
        if (ev && ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
        if (ev && ev.type === 'keydown') ev.preventDefault();
        showGpaPanel(card.getAttribute('data-gpa-panel') || '');
      }
      card.addEventListener('click', activate);
      card.addEventListener('keydown', activate);
    });
  }

  function init() {
    state.schoolId = loadSessionSchoolId();
    if (!$('gpaCourseBody')) return;

    var scaleSel = $('gpaScale');
    if (scaleSel) {
      scaleSel.innerHTML = '';
      GE.scales.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.label;
        scaleSel.appendChild(o);
      });
      scaleSel.value = 'us40pm';
    }

    state.scaleId = 'us40pm';
    state.courses = defaultCourses();

    loadRecordsFromApi(function () {
      loadStudents(function () {
        refreshYearTermSelects();
        if ($('gpaStudentSelect') && !$('gpaStudentSelect').value && state.students[0]) {
          $('gpaStudentSelect').value = String(state.students[0].id || state.students[0].student_id || '');
          state.selectedStudentId = $('gpaStudentSelect').value;
        }
        mirrorStudentSelects();
        onStudentOrTermChange();
        setStatus('');
      });
    });

    var selSt = $('gpaStudentSelect');
    if (selSt) {
      selSt.addEventListener('change', function () {
        state.selectedStudentId = selSt.value;
        mirrorStudentSelects();
        onStudentOrTermChange();
      });
    }
    var selProgram = $('gpaProgramSelect');
    if (selProgram) {
      selProgram.addEventListener('change', function () {
        state.selectedProgram = selProgram.value || '__all__';
        mirrorProgramSelects(state.selectedProgram);
        state.selectedStudentId = '';
        rebuildStudentSelects();
        onStudentOrTermChange();
      });
    }
    ;['gpaOfficialProgram', 'gpaPdfProgram', 'gpaSemProgram', 'gpaCumProgram'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('change', function () {
        state.selectedProgram = el.value || '__all__';
        mirrorProgramSelects(state.selectedProgram);
        state.selectedStudentId = '';
        rebuildStudentSelects();
        onStudentOrTermChange();
      });
    });
    ;['gpaAcademicYearSelect', 'gpaTermSelect'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', onStudentOrTermChange);
    });
    if (scaleSel) {
      scaleSel.addEventListener('change', function () {
        readFilters();
        renderCourseRows();
      });
    }

    var offSt = $('gpaOfficialStudent');
    if (offSt) {
      offSt.addEventListener('change', function () {
        if ($('gpaStudentSelect')) $('gpaStudentSelect').value = offSt.value;
        state.selectedStudentId = offSt.value;
        if ($('gpaOfficialYear') && $('gpaAcademicYearSelect')) {
          $('gpaAcademicYearSelect').value = $('gpaOfficialYear').value;
        }
        onStudentOrTermChange();
        renderOfficialTable();
      });
    }
    var offY = $('gpaOfficialYear');
    if (offY) {
      offY.addEventListener('change', function () {
        if ($('gpaAcademicYearSelect')) $('gpaAcademicYearSelect').value = offY.value;
        onStudentOrTermChange();
        renderOfficialTable();
      });
    }

    ;['gpaPdfStudent', 'gpaPdfYear'].forEach(function (id) {
      var el = $(id);
      if (el)
        el.addEventListener('change', function () {
          /* no-op preview */
        });
    });

    ;['gpaSemStudent', 'gpaSemYear', 'gpaSemTermFilter'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', renderSemesterCards);
    });

    ;['gpaCumStudent', 'gpaCumYearRange'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', renderCumulativePanel);
    });

    ;['gpaOfficialStudent', 'gpaPdfStudent', 'gpaSemStudent', 'gpaCumStudent'].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener('change', function () {
          if (id === 'gpaOfficialStudent' && $('gpaStudentSelect')) {
            $('gpaStudentSelect').value = el.value;
            state.selectedStudentId = el.value;
            onStudentOrTermChange();
          }
        });
      }
    });

    $('gpaAddRow') && $('gpaAddRow').addEventListener('click', addRow);
    $('gpaAddRowFooter') && $('gpaAddRowFooter').addEventListener('click', addRow);
    $('gpaSaveBtn') && $('gpaSaveBtn').addEventListener('click', saveRecord);
    $('gpaImportExamBtn') && $('gpaImportExamBtn').addEventListener('click', importFromExamMarks);
    $('gpaPrintBtn') && $('gpaPrintBtn').addEventListener('click', printSummary);
    $('gpaPrintSummaryBottom') && $('gpaPrintSummaryBottom').addEventListener('click', printSummary);
    $('gpaPrintTranscriptBtn') && $('gpaPrintTranscriptBtn').addEventListener('click', printOfficialTranscript);
    $('gpaDownloadPdfBtn') && $('gpaDownloadPdfBtn').addEventListener('click', downloadPdfTranscript);
    $('gpaExportReportBtn') && $('gpaExportReportBtn').addEventListener('click', exportCumulativeReport);

    bindStatCards();
    showGpaPanel('auto');
    renderOfficialTable();
    renderSemesterCards();
    renderCumulativePanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
