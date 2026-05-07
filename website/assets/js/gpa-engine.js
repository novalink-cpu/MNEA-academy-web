/**
 * GPA calculation helpers for admin GPA & Transcript UI (Program 8).
 * Weighted GPA = sum(grade_point × credits) / sum(credits)
 */
(function () {
  'use strict';

  function num(x, def) {
    var n = parseFloat(x);
    return isNaN(n) ? def : n;
  }

  function normLetter(s) {
    if (s == null) return '';
    var t = String(s).trim().toUpperCase().replace(/\s+/g, '');
    if (t === 'A*' || t === 'A★') return 'A*';
    return t;
  }

  /** US-style letter from percentage (simple A–F / 4.0). */
  function letterFromPercentUS(p) {
    var x = num(p, NaN);
    if (isNaN(x) || x < 0) return { letter: '', gp: null };
    if (x > 100) x = 100;
    if (x >= 90) return { letter: 'A', gp: 4.0 };
    if (x >= 80) return { letter: 'B', gp: 3.0 };
    if (x >= 70) return { letter: 'C', gp: 2.0 };
    if (x >= 60) return { letter: 'D', gp: 1.0 };
    return { letter: 'F', gp: 0 };
  }

  /**
   * US 4.0+ style from screenshot: % ranges → letter + GP.
   * 93–100 A, 90–92 A-, … 0–59 F
   */
  function letterFromPercentUS40Plus(p) {
    var x = num(p, NaN);
    if (isNaN(x) || x < 0) return { letter: '', gp: null };
    if (x > 100) x = 100;
    if (x >= 93) return { letter: 'A', gp: 4.0 };
    if (x >= 90) return { letter: 'A-', gp: 3.8 };
    if (x >= 87) return { letter: 'B+', gp: 3.5 };
    if (x >= 83) return { letter: 'B', gp: 3.0 };
    if (x >= 80) return { letter: 'B-', gp: 2.8 };
    if (x >= 77) return { letter: 'C+', gp: 2.5 };
    if (x >= 73) return { letter: 'C', gp: 2.0 };
    if (x >= 70) return { letter: 'C-', gp: 1.8 };
    if (x >= 60) return { letter: 'D', gp: 1.0 };
    return { letter: 'F', gp: 0.0 };
  }

  function letterFromPercentUSPlusMinus(p) {
    var x = num(p, NaN);
    if (isNaN(x) || x < 0) return { letter: '', gp: null };
    if (x > 100) x = 100;
    if (x >= 97) return { letter: 'A+', gp: 4.0 };
    if (x >= 93) return { letter: 'A', gp: 4.0 };
    if (x >= 90) return { letter: 'A-', gp: 3.7 };
    if (x >= 87) return { letter: 'B+', gp: 3.3 };
    if (x >= 83) return { letter: 'B', gp: 3.0 };
    if (x >= 80) return { letter: 'B-', gp: 2.7 };
    if (x >= 77) return { letter: 'C+', gp: 2.3 };
    if (x >= 73) return { letter: 'C', gp: 2.0 };
    if (x >= 70) return { letter: 'C-', gp: 1.7 };
    if (x >= 67) return { letter: 'D+', gp: 1.3 };
    if (x >= 63) return { letter: 'D', gp: 1.0 };
    if (x >= 60) return { letter: 'D-', gp: 0.7 };
    return { letter: 'F', gp: 0 };
  }

  var IGCSE_POINTS = {
    'A*': 4.3,
    A: 4.0,
    B: 3.0,
    C: 2.0,
    D: 1.0,
    E: 0.5,
    F: 0,
    G: 0,
    U: 0
  };

  /** BCSE-style direct letters (screenshot). */
  var BCSE_POINTS = {
    A: 4.0,
    B: 3.5,
    C: 3.0,
    D: 2.5,
    E: 2.0,
    F: 0.0
  };

  function gpFromIgcseLetter(L) {
    var k = normLetter(L);
    if (k === 'A*') return IGCSE_POINTS['A*'];
    if (IGCSE_POINTS.hasOwnProperty(k)) return IGCSE_POINTS[k];
    return null;
  }

  var US_LETTER_MAP = {
    'A+': 4.0,
    A: 4.0,
    'A-': 3.7,
    'B+': 3.3,
    B: 3.0,
    'B-': 2.7,
    'C+': 2.3,
    C: 2.0,
    'C-': 1.7,
    'D+': 1.3,
    D: 1.0,
    'D-': 0.7,
    F: 0
  };

  /** Letters matching US 4.0+ % table (screenshot GP values). */
  var US40PLUS_LETTER_MAP = {
    A: 4.0,
    'A-': 3.8,
    'B+': 3.5,
    B: 3.0,
    'B-': 2.8,
    'C+': 2.5,
    C: 2.0,
    'C-': 1.8,
    D: 1.0,
    F: 0.0
  };

  function gpFromUSLetter(L) {
    var k = normLetter(L);
    if (US_LETTER_MAP.hasOwnProperty(k)) return US_LETTER_MAP[k];
    return null;
  }

  function gpFromUS40PlusLetter(L) {
    var k = normLetter(L);
    if (US40PLUS_LETTER_MAP.hasOwnProperty(k)) return US40PLUS_LETTER_MAP[k];
    if (k === 'A+') return 4.0;
    return gpFromUSLetter(k);
  }

  function gpFromBcseLetter(L) {
    var k = normLetter(L);
    if (k.length === 1 && BCSE_POINTS.hasOwnProperty(k)) return BCSE_POINTS[k];
    return null;
  }

  /**
   * Parse a single cell: "88", "88%", "B+", "A*", " b "
   */
  function parseScoreInput(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { kind: 'empty' };
    if (/^[\d.]+$/.test(s)) return { kind: 'percent', value: num(s, NaN) };
    if (/^[\d.]+%$/.test(s)) return { kind: 'percent', value: num(s.replace('%', ''), NaN) };
    var up = s.toUpperCase().replace(/\s+/g, '');
    if (up.indexOf('A*') === 0 || up === 'ASTAR') return { kind: 'letter', value: 'A*' };
    var L = normLetter(s);
    if (L && /^[A-E][+-]?$|^[FGU]$|^[A-E]-$|^[A-E]\+$/.test(L)) return { kind: 'letter', value: L };
    if (L.length === 1 && /[ABCDFEGU]/.test(L)) return { kind: 'letter', value: L };
    return { kind: 'unknown', raw: s };
  }

  /**
   * @param {object} opts
   * @param {number} opts.credits
   * @param {string} opts.scoreInput - cell text
   * @param {string} opts.scaleId
   */
  function rowGrade(opts) {
    var credits = Math.max(0, num(opts.credits, 0));
    var scaleId = opts.scaleId || 'us40';
    var parsed = parseScoreInput(opts.scoreInput);
    var letter = '';
    var gp = null;
    var percent = null;

    if (parsed.kind === 'percent' && !isNaN(parsed.value)) {
      percent = Math.min(100, Math.max(0, parsed.value));
      if (scaleId === 'igcse') {
        var us = letterFromPercentUS(percent);
        letter = us.letter;
        gp = gpFromIgcseLetter(letter);
        if (gp == null) gp = us.gp;
      } else if (scaleId === 'us40pm') {
        var pm = letterFromPercentUSPlusMinus(percent);
        letter = pm.letter;
        gp = pm.gp;
      } else if (scaleId === 'us40plus') {
        var pl = letterFromPercentUS40Plus(percent);
        letter = pl.letter;
        gp = pl.gp;
      } else if (scaleId === 'bcse') {
        var bc = letterFromPercentUS40Plus(percent);
        letter = bc.letter;
        gp = gpFromBcseLetter(letter);
        if (gp == null) gp = bc.gp;
      } else {
        var plain = letterFromPercentUS(percent);
        letter = plain.letter;
        gp = plain.gp;
      }
    } else if (parsed.kind === 'letter') {
      letter = parsed.value;
      if (scaleId === 'igcse') {
        gp = gpFromIgcseLetter(letter);
        if (gp == null) gp = gpFromUSLetter(letter);
      } else if (scaleId === 'us40pm') {
        gp = gpFromUSLetter(letter);
        if (gp == null) gp = gpFromIgcseLetter(letter);
      } else if (scaleId === 'us40plus') {
        gp = gpFromUS40PlusLetter(letter);
        if (gp == null) gp = gpFromIgcseLetter(letter);
      } else if (scaleId === 'bcse') {
        gp = gpFromBcseLetter(letter);
        if (gp == null) gp = gpFromUS40PlusLetter(letter);
      } else {
        gp = gpFromUSLetter(letter);
        if (gp == null) gp = gpFromIgcseLetter(letter);
        if (gp == null && letter.length === 1) gp = letterFromPercentUS(85).gp;
      }
    }

    var quality = gp != null && credits > 0 ? gp * credits : null;
    return {
      credits: credits,
      letter: letter,
      gradePoint: gp,
      percent: percent,
      qualityPoints: quality,
      parseKind: parsed.kind,
      warning: parsed.kind === 'unknown' ? 'Unrecognized score' : credits <= 0 ? 'Set credits > 0' : ''
    };
  }

  function computeGPA(rows, scaleId) {
    var sumQP = 0;
    var sumCr = 0;
    var details = [];
    (rows || []).forEach(function (r, i) {
      var out = rowGrade({
        credits: r.credits,
        scoreInput: r.scoreInput,
        scaleId: scaleId || r.scaleId
      });
      details.push(Object.assign({ index: i, courseCode: r.courseCode, courseTitle: r.courseTitle }, out));
      if (out.gradePoint != null && out.credits > 0) {
        sumQP += out.gradePoint * out.credits;
        sumCr += out.credits;
      }
    });
    var gpa = sumCr > 0 ? Math.round((sumQP / sumCr) * 1000) / 1000 : null;
    return { gpa: gpa, sumCredits: sumCr, sumQualityPoints: sumQP, rows: details };
  }

  function percentFromExamRow(row) {
    if (!row || typeof row !== 'object') return null;
    if (row.average != null && !isNaN(num(row.average, NaN))) {
      var a = num(row.average, NaN);
      if (a <= 0) return null;
      return a > 100 && row.total != null ? null : Math.min(100, a);
    }
    var subs = ['myanmar', 'english', 'math', 'science', 'mathematics'];
    var vals = [];
    subs.forEach(function (k) {
      if (row[k] != null && row[k] !== '') {
        var v = num(row[k], NaN);
        if (!isNaN(v)) vals.push(Math.min(100, Math.max(0, v)));
      }
    });
    if (!vals.length && row.total != null) {
      var t = num(row.total, NaN);
      var m = num(row.maxMarks || row.max || 100, 100);
      if (!isNaN(t) && m > 0) return Math.min(100, (t / m) * 100);
    }
    if (!vals.length) return null;
    var sum = vals.reduce(function (x, y) {
      return x + y;
    }, 0);
    return Math.round((sum / vals.length) * 10) / 10;
  }

  window.GpaEngine = {
    letterFromPercentUS: letterFromPercentUS,
    letterFromPercentUSPlusMinus: letterFromPercentUSPlusMinus,
    letterFromPercentUS40Plus: letterFromPercentUS40Plus,
    parseScoreInput: parseScoreInput,
    rowGrade: rowGrade,
    computeGPA: computeGPA,
    percentFromExamRow: percentFromExamRow,
    scales: [
      { id: 'us40pm', label: '4.0 (\u00B1) (recommended)' },
      { id: 'us40', label: '4.0 Simple (A\u2013F)' },
      { id: 'us40plus', label: '4.0+ (A\u2013F)' },
      { id: 'igcse', label: 'IGCSE (A*\u2013U)' },
      { id: 'bcse', label: 'BCSE (direct)' }
    ]
  };
})();
