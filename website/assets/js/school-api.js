/**
 * School Management API —  app.py (Flask)  logic  UI  
 * Run: python app.py → http://localhost:5001 →  script  /api/*  
 */
(function () {
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

  function getApiBase() {
    if (typeof window !== 'undefined' && window.SCHOOL_API_BASE !== undefined)
      return window.SCHOOL_API_BASE;
    /*
     * Prefer same-origin for deployed environments (Render, custom domains, reverse proxy).
     * Only force localhost:5001 during local development on localhost non-5001 ports.
     */
    if (typeof window !== 'undefined' && window.location) {
      var host = String(window.location.hostname || '').toLowerCase();
      var port = String(window.location.port || '');
      var isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
      if (isLocal && port && port !== '5001') return 'http://localhost:5001';
      return '';
    }
    return '';
  }

  function request(method, path, body, opts) {
    var base = getApiBase();
    var url = (base ? base : '') + (path.indexOf('/') === 0 ? path : '/api/' + path);
    var options = {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin'
    };
    var timeoutMs = (opts && typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 5000;
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutId = null;
    if (controller) {
      options.signal = controller.signal;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);
      }
    }
    if (body !== undefined && body !== null && method !== 'GET')
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (opts && opts.headers) Object.assign(options.headers, opts.headers);
    return fetch(url, options).then(function (res) {
      var ct = res.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') >= 0) return res.json();
      return res.text().then(function (t) { return { ok: false, error: t || 'Request failed' }; });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return { ok: false, error: 'Request timeout' };
      return { ok: false, error: (err && err.message) || 'Network error' };
    }).finally(function () {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  window.SchoolAPI = window.SchoolAPI || {};

  /**
   * Shared course options for all admin dropdowns.
   * Keep this list aligned with Academic Management defaults.
   */
  SchoolAPI.DEFAULT_COURSE_OPTIONS = [
    'IGCSE',
    'Pre-IGCSE',
    'Global Primary Learning Program',
    'English 4 Skills (PEIC, UK)',
    'Chinese Language Program',
    'Business & Management',
    'Coding & Robotics',
    'Online Class'
  ];

  SchoolAPI.DEFAULT_LEVEL_OPTIONS = [
    'Pre-Foundation',
    'Foundation I',
    'Foundation II',
    'Pre-Elementary',
    'Elementary',
    'Pre-Intermediate',
    'Intermediate',
    'Intermediate Plus',
    'Upper Intermediate (B2)'
  ];

  /** Fixed programs for registration + dashboard chart (order: Pre-IGCSE match before IGCSE in UI logic). */
  SchoolAPI.CANONICAL_PROGRAM_OPTIONS = [
    'IGCSE',
    'Pre-IGCSE',
    'Global Primary Learning Program',
    'English 4 Skills (PEIC, UK)',
    'Chinese Language Program',
    'Business & Management',
    'Coding & Robotics',
    'Online Class'
  ];

  /**
   * Order program/course labels for dropdowns: canonical programs first (fixed order),
   * then any other names A–Z (case-insensitive). De-duplicates by exact string.
   */
  SchoolAPI.orderProgramOptionNames = function (names) {
    var arr = (names || []).map(function (x) {
      return x == null ? '' : String(x).trim();
    }).filter(function (s) {
      return s.length > 0;
    });
    var seen = {};
    var uniq = [];
    arr.forEach(function (s) {
      if (!seen[s]) {
        seen[s] = true;
        uniq.push(s);
      }
    });
    var canon = SchoolAPI.CANONICAL_PROGRAM_OPTIONS || [];
    var picked = {};
    var out = [];
    canon.forEach(function (c) {
      if (uniq.indexOf(c) >= 0 && !picked[c]) {
        picked[c] = true;
        out.push(c);
      }
    });
    var rest = uniq.filter(function (s) {
      return !picked[s];
    });
    rest.sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    return out.concat(rest);
  };

  /**
   * Match API level/batch row to a selected program label (substring + keyword rules).
   */
  SchoolAPI.entityMatchesProgram = function (entity, programName) {
    if (!programName || !String(programName).trim()) return true;
    if (!entity) return false;
    var target = String(programName).trim().toLowerCase();
    var parts = [
      entity.course_name,
      entity.name,
      entity.level_name,
      entity.batch_name,
      entity.course,
      entity.course_title
    ];
    var hay = parts
      .filter(function (x) {
        return x != null && String(x).trim() !== '';
      })
      .join(' ')
      .toLowerCase();
    if (!hay) return false;
    if (hay === target || hay.indexOf(target) >= 0) return true;
    if (target.indexOf(hay) >= 0 && hay.length >= 4) return true;
    if (/pre[-\s]?igcse|pre\s*igcse|preigcse/.test(target)) return /pre[-\s]?igcse|preigcse|pre\s*igcse/.test(hay);
    if (target.indexOf('igcse') >= 0 && target.indexOf('pre') < 0)
      return hay.indexOf('igcse') >= 0 && !/pre[-\s]?igcse|preigcse|pre\s*igcse/.test(hay);
    if (target.indexOf('global primary') >= 0) return /global primary|gplp|\bgpl\b|primary learning/.test(hay);
    if (target.indexOf('english 4 skills') >= 0 || target.indexOf('peic') >= 0)
      return /peic|english 4 skills|english four skills|e4s|uk\s*peic|pearson english international/.test(hay);
    if (target.indexOf('chinese') >= 0) return /chinese|mandarin|中文|汉语/.test(hay);
    if (target.indexOf('business') >= 0) return /business|management|b\s*&\s*m|commerce/.test(hay);
    if (target.indexOf('coding') >= 0 || target.indexOf('robotics') >= 0)
      return /coding|robotics|programming|scratch|python|stem|robot/.test(hay);
    if (target.indexOf('online') >= 0) return /online|zoom|virtual|remote|distance|e-?learning/.test(hay);
    return false;
  };

  SchoolAPI.ping = function () {
    return request('GET', '/api/ping');
  };

  SchoolAPI.getConfig = function () {
    return request('GET', '/api/config');
  };

  /** Set active academic year (adds to list if new). POST /api/config */
  SchoolAPI.setAcademicYear = function (year) {
    return request('POST', '/api/config', { academic_year: String(year || '').trim() });
  };

  /** Export MySQL data to data/backups/*.json. POST /api/backup */
  SchoolAPI.backupDatabase = function () {
    return request('POST', '/api/backup', {});
  };

  /** Restore from JSON backup (dangerous). POST /api/restore multipart */
  SchoolAPI.restoreDatabase = function (file) {
    if (!file) return Promise.resolve({ ok: false, error: 'No file' });
    var base = getApiBase();
    var url = (base ? base : '') + '/api/restore';
    var fd = new FormData();
    fd.append('file', file);
    return fetch(url, { method: 'POST', body: fd, credentials: 'same-origin' }).then(function (res) {
      var ct = res.headers.get('Content-Type') || '';
      if (ct.indexOf('application/json') >= 0) return res.json();
      return res.text().then(function (t) {
        return { ok: res.ok, error: t || 'Request failed' };
      });
    });
  };

  /** GET /api/email-config/status — SMTP configured via server environment */
  SchoolAPI.getEmailConfigStatus = function () {
    return request('GET', '/api/email-config/status');
  };

  /** POST /api/email-config/test — send a simple test message */
  SchoolAPI.sendTestEmail = function (to) {
    return request('POST', '/api/email-config/test', { to: String(to || '').trim() }, { timeoutMs: 20000 });
  };

  /** Submit admission application (public form) → goes to New Applications */
  SchoolAPI.submitAdmissionApplication = function (data) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    return request('POST', 'admission_application', payload);
  };

  /** Placement result email notification */
  SchoolAPI.sendResultEmail = function (data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/send-result-email', payload, { timeoutMs: 12000 });
  };

  /** Placement test attempt controls (retake limit / admin reset). */
  SchoolAPI.getPlacementAttemptStatus = function (payload, schoolId) {
    var body = payload && typeof payload === 'object' ? Object.assign({}, payload) : {};
    if (schoolId) body.school_id = schoolId;
    return request('POST', '/api/placement/attempts/check', body);
  };

  SchoolAPI.recordPlacementAttempt = function (payload, schoolId) {
    var body = payload && typeof payload === 'object' ? Object.assign({}, payload) : {};
    if (schoolId) body.school_id = schoolId;
    return request('POST', '/api/placement/attempts/submit', body);
  };

  SchoolAPI.resetPlacementAttempts = function (payload, schoolId) {
    var body = payload && typeof payload === 'object' ? Object.assign({}, payload) : {};
    if (schoolId) body.school_id = schoolId;
    return request('POST', '/api/placement/attempts/reset', body);
  };

  SchoolAPI.getPlacementQuestionBank = function (schoolId) {
    return SchoolAPI.getWebExtra('placement_question_bank', schoolId).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.data) || !r.data.length) return {};
      var first = r.data[0];
      return (first && typeof first === 'object') ? first : {};
    });
  };

  SchoolAPI.savePlacementQuestionBank = function (bank, schoolId) {
    var payload = (bank && typeof bank === 'object') ? bank : {};
    return SchoolAPI.saveWebExtra('placement_question_bank', [payload], schoolId);
  };

  /** Login: POST /api/login → { ok, role, school_id, school_name, username } */
  SchoolAPI.login = function (schoolId, username, password) {
    return request('POST', '/api/login', {
      school_id: schoolId || undefined,
      username: (username || '').trim(),
      password: password || ''
    });
  };

  /** POST /api/change-password — SQLite school admin/users or MySQL bcrypt users */
  SchoolAPI.changePassword = function (schoolId, username, currentPassword, newPassword) {
    return request(
      'POST',
      '/api/change-password',
      {
        school_id: schoolId || undefined,
        username: (username || '').trim(),
        current_password: currentPassword || '',
        new_password: newPassword || ''
      },
      { timeoutMs: 15000 }
    );
  };

  /** Dashboard: GET /api/dashboard → total_students, total_teachers, priority_alerts, new_admissions_this_month, etc. */
  SchoolAPI.getDashboard = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/dashboard' + q);
  };

  /** Students: GET /api/students, GET /api/students/:id, POST, PUT, DELETE */
  SchoolAPI.getStudents = function (schoolId, grade, className) {
    var q = [];
    if (schoolId) q.push('school_id=' + encodeURIComponent(schoolId));
    if (grade) q.push('grade=' + encodeURIComponent(grade));
    if (className) q.push('class=' + encodeURIComponent(className));
    return request('GET', '/api/students' + (q.length ? '?' + q.join('&') : ''));
  };

  SchoolAPI.getStudent = function (studentId, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/students/' + encodeURIComponent(studentId) + q);
  };

  SchoolAPI.addStudent = function (data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/students', payload);
  };

  SchoolAPI.updateStudent = function (studentId, data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('PUT', '/api/students/' + encodeURIComponent(studentId), payload);
  };

  SchoolAPI.deleteStudent = function (studentId, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('DELETE', '/api/students/' + encodeURIComponent(studentId) + q);
  };

  /** Teachers */
  SchoolAPI.getTeachers = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/teachers' + q);
  };

  SchoolAPI.getTeacher = function (username, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/teachers/' + encodeURIComponent(username) + q);
  };

  SchoolAPI.addTeacher = function (data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/teachers', payload);
  };

  SchoolAPI.updateTeacher = function (username, data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('PUT', '/api/teachers/' + encodeURIComponent(username), payload);
  };

  SchoolAPI.deleteTeacher = function (username, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('DELETE', '/api/teachers/' + encodeURIComponent(username) + q);
  };

  /** Designations (for teacher form) */
  SchoolAPI.getDesignations = function () {
    return request('GET', '/api/designations');
  };

  /** Classes, Exams, Subjects, Settings */
  SchoolAPI.getClasses = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/classes' + q);
  };

  SchoolAPI.getExams = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/exams' + q);
  };

  SchoolAPI.getSubjects = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/subjects' + q);
  };

  SchoolAPI.getSettings = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/settings' + q);
  };

  SchoolAPI.saveSettings = function (data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/settings', payload);
  };

  /** Academic management */
  SchoolAPI.getCourses = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/courses' + q);
  };

  SchoolAPI.addCourse = function (data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/courses', payload);
  };

  SchoolAPI.updateCourse = function (courseId, data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('PUT', '/api/courses/' + encodeURIComponent(courseId), payload);
  };

  SchoolAPI.deleteCourse = function (courseId, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('DELETE', '/api/courses/' + encodeURIComponent(courseId) + q);
  };

  SchoolAPI.getLevels = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/levels' + q);
  };

  SchoolAPI.addLevel = function (data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/levels', payload);
  };

  SchoolAPI.updateLevel = function (levelId, data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('PUT', '/api/levels/' + encodeURIComponent(levelId), payload);
  };

  SchoolAPI.deleteLevel = function (levelId, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('DELETE', '/api/levels/' + encodeURIComponent(levelId) + q);
  };

  SchoolAPI.getBatches = function (schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/batches' + q);
  };

  SchoolAPI.addBatch = function (data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/batches', payload);
  };

  SchoolAPI.updateBatch = function (batchId, data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('PUT', '/api/batches/' + encodeURIComponent(batchId), payload);
  };

  SchoolAPI.deleteBatch = function (batchId, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('DELETE', '/api/batches/' + encodeURIComponent(batchId) + q);
  };

  SchoolAPI.getBatchStudents = function (batchId, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/batches/' + encodeURIComponent(batchId) + '/students' + q);
  };

  SchoolAPI.getBatchTimetables = function (batchId, schoolId) {
    var q = [];
    if (schoolId) q.push('school_id=' + encodeURIComponent(schoolId));
    if (batchId) q.push('batch_id=' + encodeURIComponent(batchId));
    return request('GET', '/api/batch-timetables' + (q.length ? '?' + q.join('&') : ''));
  };

  SchoolAPI.addBatchTimetable = function (data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/batch-timetables', payload);
  };

  SchoolAPI.updateBatchTimetable = function (timetableId, data, schoolId) {
    var payload = data && typeof data === 'object' ? Object.assign({}, data) : {};
    if (schoolId) payload.school_id = schoolId;
    return request('PUT', '/api/batch-timetables/' + encodeURIComponent(timetableId), payload);
  };

  SchoolAPI.deleteBatchTimetable = function (timetableId, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('DELETE', '/api/batch-timetables/' + encodeURIComponent(timetableId) + q);
  };

  /** Batch attendance (SQLite): one row per student per batch per date */
  SchoolAPI.getBatchAttendanceSession = function (batchId, dateStr, opts) {
    var q = [
      'batch_id=' + encodeURIComponent(batchId),
      'date=' + encodeURIComponent(dateStr || '')
    ];
    if (opts && opts.assignedTeacher)
      q.push('assigned_teacher=' + encodeURIComponent(opts.assignedTeacher));
    if (opts && opts.schoolId) q.push('school_id=' + encodeURIComponent(opts.schoolId));
    return request('GET', '/api/attendance?' + q.join('&'));
  };

  SchoolAPI.saveBatchAttendance = function (payload) {
    return request('POST', '/api/attendance/save', payload || {});
  };

  SchoolAPI.getAttendanceRecords = function (batchId, from, to, opts) {
    var q = [];
    if (batchId != null && String(batchId).trim() !== '')
      q.push('batch_id=' + encodeURIComponent(batchId));
    if (from) q.push('from=' + encodeURIComponent(from));
    if (to) q.push('to=' + encodeURIComponent(to));
    if (opts && opts.assignedTeacher)
      q.push('assigned_teacher=' + encodeURIComponent(opts.assignedTeacher));
    if (opts && opts.teacherUsername)
      q.push('teacher_username=' + encodeURIComponent(opts.teacherUsername));
    if (opts && opts.statusFilter)
      q.push('status_filter=' + encodeURIComponent(opts.statusFilter));
    if (opts && opts.schoolId) q.push('school_id=' + encodeURIComponent(opts.schoolId));
    return request('GET', '/api/attendance/records?' + q.join('&'));
  };

  /** Teacher's batches with per-student attendance rate + last 3 statuses */
  SchoolAPI.getTeacherStudentsAttendanceSummary = function (assignedTeacher, schoolId) {
    var q = ['assigned_teacher=' + encodeURIComponent(assignedTeacher || '')];
    if (schoolId) q.push('school_id=' + encodeURIComponent(schoolId));
    return request('GET', '/api/attendance/teacher-students-summary?' + q.join('&'));
  };

  SchoolAPI.getAttendanceTodayOverview = function (dateStr, schoolId) {
    var q = [];
    if (dateStr) q.push('date=' + encodeURIComponent(dateStr));
    if (schoolId) q.push('school_id=' + encodeURIComponent(schoolId));
    return request('GET', '/api/attendance/today-overview' + (q.length ? '?' + q.join('&') : ''));
  };

  SchoolAPI.unlockAttendanceSession = function (batchId, dateStr, schoolId) {
    var q = ['batch_id=' + encodeURIComponent(batchId), 'date=' + encodeURIComponent(dateStr || '')];
    if (schoolId) q.push('school_id=' + encodeURIComponent(schoolId));
    return request('DELETE', '/api/attendance/session-lock?' + q.join('&'));
  };

  SchoolAPI.lockAttendanceSession = function (batchId, dateStr, schoolId, takenBy) {
    var payload = { batch_id: parseInt(batchId, 10), date: dateStr || '' };
    if (schoolId) payload.school_id = schoolId;
    if (takenBy) payload.taken_by = takenBy;
    return request('POST', '/api/attendance/session-lock', payload);
  };

  SchoolAPI.getStudentAttendanceReport = function (studentId, schoolId, opts) {
    var q = ['student_id=' + encodeURIComponent(studentId || '')];
    if (schoolId) q.push('school_id=' + encodeURIComponent(schoolId));
    if (opts) {
      if (opts.from) q.push('from=' + encodeURIComponent(opts.from));
      if (opts.to) q.push('to=' + encodeURIComponent(opts.to));
      if (opts.batchId != null && String(opts.batchId).trim() !== '')
        q.push('batch_id=' + encodeURIComponent(opts.batchId));
    }
    return request('GET', '/api/attendance/student-report?' + q.join('&'));
  };

  SchoolAPI.getBatchesForTeacher = function (teacherUsername, schoolId) {
    var q = [];
    if (schoolId) q.push('school_id=' + encodeURIComponent(schoolId));
    if (teacherUsername) q.push('assigned_teacher=' + encodeURIComponent(teacherUsername));
    return request('GET', '/api/batches' + (q.length ? '?' + q.join('&') : ''));
  };

  /** web_extra: notices, attendance_entries, exam_marks, admission_applications, etc. */
  SchoolAPI.getWebExtra = function (key, schoolId) {
    var q = schoolId ? '?school_id=' + encodeURIComponent(schoolId) : '';
    return request('GET', '/api/web_extra/' + encodeURIComponent(key) + q);
  };

  SchoolAPI.saveWebExtra = function (key, data, schoolId) {
    var payload = { data: Array.isArray(data) ? data : (data ? [data] : []) };
    if (schoolId) payload.school_id = schoolId;
    return request('POST', '/api/web_extra/' + encodeURIComponent(key), payload);
  };

  /** Notices (convenience) */
  SchoolAPI.getNotices = function (schoolId) {
    return SchoolAPI.getWebExtra('notices', schoolId).then(function (r) {
      return r && r.ok ? r.data : [];
    });
  };

  SchoolAPI.saveNotices = function (list, schoolId) {
    return SchoolAPI.saveWebExtra('notices', Array.isArray(list) ? list : [], schoolId);
  };

  /**
   * Attendance: store in web_extra "attendance_entries"
   * Format: [ { date, class_id, records: [ { student_id, name, status } ] } ]
   */
  SchoolAPI.getAttendance = function (classId, date, schoolId) {
    return SchoolAPI.getWebExtra('attendance_entries', schoolId).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.data)) return [];
      var entry = r.data.find(function (e) {
        return (e.class_id || e.classId) === classId && (e.date || '') === (date || '');
      });
      return entry && entry.records ? entry.records : [];
    });
  };

  SchoolAPI.saveAttendance = function (classId, date, records, schoolId) {
    return SchoolAPI.getWebExtra('attendance_entries', schoolId).then(function (r) {
      var list = (r && r.ok && Array.isArray(r.data)) ? r.data.slice() : [];
      var recs = (records || []).map(function (r) {
        return {
          student_id: r.studentId || r.student_id || r.id || r.name,
          name: r.name || r.student_id || '',
          status: (r.status || 'present').toLowerCase()
        };
      });
      var idx = list.findIndex(function (e) {
        return (e.class_id || e.classId) === classId && (e.date || '') === (date || '');
      });
      var entry = { date: date || '', class_id: classId, records: recs };
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      return SchoolAPI.saveWebExtra('attendance_entries', list, schoolId);
    });
  };

  /**
   * Marks: store in web_extra "exam_marks"
   * Format: [ { class_id, exam_key, rows: [ { student_id, name, myanmar, english, math, science, total, average, grade, rank } ] } ]
   */
  SchoolAPI.getMarks = function (classId, examKey, schoolId) {
    return SchoolAPI.getWebExtra('exam_marks', schoolId).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.data)) return [];
      var entry = r.data.find(function (e) {
        return (e.class_id || e.classId) === classId && (e.exam_key || e.examKey || '') === (examKey || '');
      });
      return entry && entry.rows ? entry.rows : [];
    });
  };

  SchoolAPI.saveMarks = function (classId, examKey, rows, schoolId) {
    return SchoolAPI.getWebExtra('exam_marks', schoolId).then(function (r) {
      var list = (r && r.ok && Array.isArray(r.data)) ? r.data.slice() : [];
      var idx = list.findIndex(function (e) {
        return (e.class_id || e.classId) === classId && (e.exam_key || e.examKey || '') === (examKey || '');
      });
      var entry = { class_id: classId, exam_key: examKey, rows: rows || [] };
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      return SchoolAPI.saveWebExtra('exam_marks', list, schoolId);
    });
  };

  /** All exam mark books: same shape as exam_marks web_extra array */
  SchoolAPI.getAllExamMarks = function (schoolId) {
    return SchoolAPI.getWebExtra('exam_marks', schoolId).then(function (r) {
      return (r && r.ok && Array.isArray(r.data)) ? r.data : [];
    });
  };

  /**
   * GPA / transcript working records (admin GPA page)
   * Format: [ { student_id, student_name, academic_year, term, scale_id, courses: [ { courseCode, courseTitle, credits, scoreInput } ], updated_at } ]
   */
  SchoolAPI.getGpaTranscriptRecords = function (schoolId) {
    return SchoolAPI.getWebExtra('gpa_transcript_records', schoolId).then(function (r) {
      return (r && r.ok && Array.isArray(r.data)) ? r.data : [];
    });
  };

  SchoolAPI.saveGpaTranscriptRecords = function (list, schoolId) {
    return SchoolAPI.saveWebExtra('gpa_transcript_records', Array.isArray(list) ? list : [], schoolId);
  };

  /**
   * Student documents: web_extra "student_documents"
   * Format: [ { id, student_id, document_type, file_name, mime_type, file_data (base64), description, uploaded_date, last_updated } ]
   */
  SchoolAPI.getStudentDocumentsList = function (schoolId) {
    return SchoolAPI.getWebExtra('student_documents', schoolId).then(function (r) {
      return (r && r.ok && Array.isArray(r.data)) ? r.data : [];
    });
  };

  SchoolAPI.getStudentDocuments = function (studentId, schoolId) {
    return SchoolAPI.getStudentDocumentsList(schoolId).then(function (list) {
      return (list || []).filter(function (e) {
        return (e.student_id || '') === (studentId || '');
      });
    });
  };

  SchoolAPI.addStudentDocument = function (entry, schoolId) {
    var doc = entry && typeof entry === 'object' ? Object.assign({}, entry) : {};
    if (!doc.id) doc.id = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    if (!doc.uploaded_date) doc.uploaded_date = new Date().toISOString().slice(0, 10);
    doc.last_updated = doc.uploaded_date;
    return SchoolAPI.getStudentDocumentsList(schoolId).then(function (list) {
      var arr = Array.isArray(list) ? list.slice() : [];
      arr.push(doc);
      return SchoolAPI.saveWebExtra('student_documents', arr, schoolId);
    });
  };

  SchoolAPI.deleteStudentDocument = function (documentId, schoolId) {
    return SchoolAPI.getStudentDocumentsList(schoolId).then(function (list) {
      var arr = (list || []).filter(function (e) { return (e.id || '') !== (documentId || ''); });
      return SchoolAPI.saveWebExtra('student_documents', arr, schoolId);
    });
  };

  /**
   * Teacher documents: web_extra "teacher_documents"
   * Format: [ { id, teacher_id (username), document_type, file_name, mime_type, file_data, description, uploaded_date, last_updated } ]
   */
  SchoolAPI.getTeacherDocumentsList = function (schoolId) {
    return SchoolAPI.getWebExtra('teacher_documents', schoolId).then(function (r) {
      return (r && r.ok && Array.isArray(r.data)) ? r.data : [];
    });
  };

  SchoolAPI.getTeacherDocuments = function (teacherId, schoolId) {
    return SchoolAPI.getTeacherDocumentsList(schoolId).then(function (list) {
      return (list || []).filter(function (e) {
        return (e.teacher_id || e.username || '') === (teacherId || '');
      });
    });
  };

  SchoolAPI.addTeacherDocument = function (entry, schoolId) {
    var doc = entry && typeof entry === 'object' ? Object.assign({}, entry) : {};
    if (!doc.id) doc.id = 'tdoc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    if (!doc.uploaded_date) doc.uploaded_date = new Date().toISOString().slice(0, 10);
    doc.last_updated = doc.uploaded_date;
    return SchoolAPI.getTeacherDocumentsList(schoolId).then(function (list) {
      var arr = Array.isArray(list) ? list.slice() : [];
      arr.push(doc);
      return SchoolAPI.saveWebExtra('teacher_documents', arr, schoolId);
    });
  };

  SchoolAPI.deleteTeacherDocument = function (documentId, schoolId) {
    return SchoolAPI.getTeacherDocumentsList(schoolId).then(function (list) {
      var arr = (list || []).filter(function (e) { return (e.id || '') !== (documentId || ''); });
      return SchoolAPI.saveWebExtra('teacher_documents', arr, schoolId);
    });
  };

  /**
   * UX helper: open browser date calendar immediately on click/focus.
   * Works on pages with <input type="date"> when browser supports showPicker().
   */
  function prepareDateInputLocale(input) {
    if (!input) return;
    if (!input.getAttribute('lang')) input.setAttribute('lang', 'en-GB');
    if (!input.getAttribute('placeholder')) input.setAttribute('placeholder', 'dd/mm/yyyy');
    input.setAttribute('data-date-order', 'dmy');
  }
  function enableInstantDatePicker() {
    if (typeof document === 'undefined') return;
    var dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(function (input) {
      prepareDateInputLocale(input);
      if (!input || input.dataset.instantPickerBound === '1') return;
      input.dataset.instantPickerBound = '1';
      var openPicker = function () {
        if (typeof input.showPicker === 'function') {
          try { input.showPicker(); } catch (e) {}
        }
      };
      input.addEventListener('click', openPicker);
      input.addEventListener('focus', openPicker);
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enableInstantDatePicker);
    } else {
      enableInstantDatePicker();
    }
    if (typeof MutationObserver !== 'undefined') {
      try {
        var mo = new MutationObserver(function () { enableInstantDatePicker(); });
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
      } catch (e) {}
    }
  }

  /** Check if backend is available (for UI to choose API vs Firebase) */
  SchoolAPI.isAvailable = function () {
    return SchoolAPI.ping().then(function (r) { return r && r.ok; }).catch(function () { return false; });
  };
})();
