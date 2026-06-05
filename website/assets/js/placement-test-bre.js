(function() {
  'use strict';

  var LISTENING_COUNT = 20;
  var TOTAL_COUNT = 80;
  var PASSING_SCORE = 50;
  /** Raw online total (0–80) on Test 1A; at or above → continue with Test 2A (CMS: placementTest.adaptiveThresholdTest2). */
  var ADAPTIVE_THRESHOLD_TO_TEST2A = 75;

  function applyAdaptiveThresholdFromConfig(pt) {
    var raw = pt && (pt.adaptiveThresholdTest2 != null ? pt.adaptiveThresholdTest2 : pt.adaptive_threshold_test2);
    var t = parseInt(raw, 10);
    if (!isNaN(t) && t >= 1 && t <= 80) ADAPTIVE_THRESHOLD_TO_TEST2A = t;
  }
  var TEST_DURATION_SECONDS = 60 * 60;
  var currentStep = 1;
  var currentIndex = 0;
  var answers = [];
  var timeLeft = TEST_DURATION_SECONDS;
  var timerId = null;
  var playCount = 0;
  var listenLimit = 2;
  var selectedForm = 'test1a';
  var lastCertPayload = null;
  /** After 75+/80 on Test 1, full certificate payload for General Test 1 (Form A); cleared on new attempt. */
  var lastRound1CertPayload = null;
  /** Persists Test 1 answers/scores locally until Test 2 is submitted, then merged into payload as test1_snapshot. */
  var TEST1_SNAPSHOT_LS_KEY = 'placement_test_bre_test1_snapshot';
  var PLACEMENT_DEVICE_KEY = 'mnea_placement_device_id';

  var ONLINE_POINTS_MAX = 80;

  function getPlacementDeviceId() {
    try {
      var id = localStorage.getItem(PLACEMENT_DEVICE_KEY);
      if (id && String(id).length >= 8) return String(id);
      id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      localStorage.setItem(PLACEMENT_DEVICE_KEY, id);
      return id;
    } catch (e) {
      return 'dev-' + Date.now();
    }
  }

  function checkRetakeEligibility(payload) {
    if (!window.SchoolAPI || !SchoolAPI.getPlacementAttemptStatus) {
      return Promise.resolve({ ok: true, can_take_test: true });
    }
    return SchoolAPI.getPlacementAttemptStatus({
      name: payload && payload.name ? payload.name : '',
      email: payload && payload.email ? payload.email : '',
      phone: payload && payload.phone ? payload.phone : '',
      date_of_birth: payload && payload.date_of_birth ? payload.date_of_birth : '',
      parent_name: payload && payload.parent_name ? payload.parent_name : '',
      device_id: getPlacementDeviceId()
    }).catch(function() {
      return { ok: true, can_take_test: true };
    });
  }

  function recordAttemptOnSubmit(payload) {
    if (!window.SchoolAPI || !SchoolAPI.recordPlacementAttempt) return Promise.resolve(false);
    return SchoolAPI.recordPlacementAttempt({
      name: payload && (payload.name || payload.student_name) ? (payload.name || payload.student_name) : '',
      email: payload && payload.email ? payload.email : '',
      phone: payload && payload.phone ? payload.phone : '',
      date_of_birth: payload && payload.date_of_birth ? payload.date_of_birth : '',
      parent_name: payload && payload.parent_name ? payload.parent_name : '',
      device_id: getPlacementDeviceId(),
      client_submission_id: payload && payload.client_submission_id ? payload.client_submission_id : '',
      total_score: payload && payload.total_score != null ? payload.total_score : 0,
      suggested_level: payload && payload.suggested_level ? payload.suggested_level : '',
      result_status: payload && payload.result_status ? payload.result_status : '',
      isPassed: payload && payload.result_status ? payload.result_status === 'PASS' : false
    }).then(function(res) {
      return !!(res && res.ok);
    }).catch(function() {
      return false;
    });
  }

  function schoolContactDefaults() {
    var addrEl = document.querySelector('[data-content-id="contact_address"]');
    var addr = addrEl && addrEl.textContent ? String(addrEl.textContent).trim() : '';
    if (!addr) addr = 'No.5311, Myat Lay Street, and Sagaing St, Ottarathiri 15015, Naypyitaw';
    return {
      schoolName: 'Myanmar New Era International Education Centre',
      address: addr,
      phone: '+95 9 885 511664, +95 9 885 511665',
      email: 'office@mmnea.com',
      officeHours: 'Monday–Friday, 9:00 AM – 5:00 PM'
    };
  }

  function pad2(n) {
    var x = Math.max(0, parseInt(n, 10) || 0);
    return (x < 10 ? '0' : '') + x;
  }

  function totalOnlinePointsFromPayload(payload) {
    var t = parseInt(payload.total_online_points, 10);
    if (!isNaN(t) && t >= 0) return Math.min(ONLINE_POINTS_MAX, t);
    var sum =
      (parseInt(payload.listening_score, 10) || 0) +
      (parseInt(payload.grammar_score, 10) || 0) +
      (parseInt(payload.vocabulary_score, 10) || 0) +
      (parseInt(payload.reading_score, 10) || 0);
    return Math.min(ONLINE_POINTS_MAX, Math.max(0, sum));
  }

  function formatTotalOutOf80(raw) {
    var x = Math.min(ONLINE_POINTS_MAX, Math.max(0, Math.round(parseFloat(raw) || 0)));
    if (x >= ONLINE_POINTS_MAX) return String(ONLINE_POINTS_MAX);
    return pad2(x);
  }

  function formatAwardDate(isoText) {
    var d = new Date(isoText || '');
    if (isNaN(d.getTime())) return String(isoText || '').slice(0, 10);
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  /** Raw online total (0–80) → band column index */
  function bandIndexFromRaw80(raw80, form) {
    var r = Math.max(0, Math.min(80, parseInt(raw80, 10) || 0));
    if (form === 'test1a') {
      if (r >= 76) return 5;
      if (r >= 69) return 4;
      if (r >= 57) return 3;
      if (r >= 36) return 2;
      if (r >= 5) return 1;
      return 0;
    }
    if (form === 'test2a') {
      if (r >= 69) return 4;
      if (r >= 56) return 3;
      if (r >= 41) return 2;
      if (r >= 27) return 1;
      return 0;
    }
    return bandIndexFromRaw80(r, 'test2a');
  }

  var CERT_BANDS_TEST1A = {
    ranges: ['0–4', '5–35', '36–56', '57–68', '69–75', '76–80'],
    cefr: ['below A1', 'A1', 'A2', 'A2+', 'B1', 'B1+ or higher'],
    gse: ['>22', '22–29', '30–35', '36–42', '43–50', '<50']
  };

  var CERT_BANDS_TEST2A = {
    ranges: ['0–26', '27–40', '41–55', '56–68', '69–80'],
    cefr: ['Below B1', 'B1', 'B1+', 'B2', 'B2+ or higher'],
    cefrBand: [
      'Below B1. Suggest taking General Test 1 for more accurate placement.',
      'B1',
      'B1+',
      'B2',
      'B2+ or higher'
    ],
    gse: ['< 43', '43–50', '51–58', '59–66', '> 66']
  };

  function getCertBandDefinitions(form) {
    if (form === 'test1a') return CERT_BANDS_TEST1A;
    if (form === 'test2a') return CERT_BANDS_TEST2A;
    return CERT_BANDS_TEST2A;
  }

  function cefrFromRaw80(raw80, form) {
    var def = getCertBandDefinitions(form);
    var idx = bandIndexFromRaw80(raw80, form);
    idx = Math.max(0, Math.min(def.cefr.length - 1, idx));
    return def.cefr[idx];
  }

  function bandSummaryFromPayload(payload) {
    var raw80 = totalOnlinePointsFromPayload(payload);
    var form = payload.test_form || selectedForm;
    var def = getCertBandDefinitions(form);
    var idx = bandIndexFromRaw80(raw80, form);
    idx = Math.max(0, Math.min(def.ranges.length - 1, idx));
    return {
      range: def.ranges[idx],
      label: def.cefr[idx],
      line: def.ranges[idx] + ' (out of 80) → ' + def.cefr[idx]
    };
  }

  function buildCertExplainer(form) {
    if (form === 'test1a') {
      return (
        '<span class="pt-cert-explainer-row">The <strong>score out of 80</strong> above is your <strong>raw</strong> total (Listening · Grammar · Vocabulary · Reading; max <strong>80</strong>).</span>' +
        '<span class="pt-cert-explainer-row"><strong>General Test 1</strong>: three rows — bands, <strong>GSE</strong>, <strong>CEFR</strong>; your highlighted column is your band.</span>' +
        '<span class="pt-cert-explainer-row"><strong>Writing</strong> and <strong>Speaking</strong> are assessed separately at the <strong>centre</strong>.</span>'
      );
    }
    if (form === 'test2a') {
      return (
        '<span class="pt-cert-explainer-row">The <strong>score out of 80</strong> above is your <strong>raw</strong> total (Listening · Grammar · Vocabulary · Reading; max <strong>80</strong>).</span>' +
        '<span class="pt-cert-explainer-row"><strong>General Test 2</strong>: three rows (score, GSE, CEFR). <strong>41–55</strong> → <strong>General Test 1</strong> for placement.</span>' +
        '<span class="pt-cert-explainer-row"><strong>Writing</strong> and <strong>Speaking</strong> are assessed separately at the <strong>centre</strong>.</span>'
      );
    }
    return (
      '<span class="pt-cert-explainer-row">The <strong>score out of 80</strong> above is your <strong>raw</strong> total (Listening · Grammar · Vocabulary · Reading; max <strong>80</strong>).</span>' +
      '<span class="pt-cert-explainer-row">Three rows: <strong>score bands</strong>, <strong>GSE</strong>, <strong>CEFR</strong> for your test form; your column is highlighted.</span>' +
      '<span class="pt-cert-explainer-row"><strong>Writing</strong> and <strong>Speaking</strong> are assessed separately at the <strong>centre</strong>.</span>'
    );
  }

  function certBandMatrixLinesForPdf(form) {
    var def = getCertBandDefinitions(form);
    var join = '  |  ';
    var gseVals = [];
    var i;
    for (i = 0; i < def.ranges.length; i++) {
      gseVals.push(def.gse && def.gse[i] != null ? String(def.gse[i]) : '—');
    }
    var cefrVals = [];
    for (i = 0; i < def.ranges.length; i++) {
      cefrVals.push(def.cefrBand && def.cefrBand[i] != null ? String(def.cefrBand[i]) : String(def.cefr[i]));
    }
    return [
      'General test total score — ' + def.ranges.join(join),
      'GSE level — ' + gseVals.join(join),
      'CEFR level — ' + cefrVals.join(join)
    ];
  }

  function sectionLevelFromRaw(raw, max, form) {
    var m = Math.max(1, parseInt(max, 10) || 1);
    var r = Math.max(0, parseInt(raw, 10) || 0);
    var equiv80 = Math.round((r / m) * 80);
    return cefrFromRaw80(equiv80, form || selectedForm);
  }

  function skillCheckSvg() {
    return '<svg class="pt-cert-skill-svg" viewBox="0 0 48 48" aria-hidden="true" width="22" height="22" focusable="false"><circle cx="24" cy="24" r="22" fill="currentColor"/><path fill="#ffffff" d="M20.5 32.2 14 25.7l2.1-2.1 4.3 4.3L31.9 12l2.5 2-13.9 18.2z"/></svg>';
  }

  function buildCertRangeGrids(activeIdx, form) {
    var def = getCertBandDefinitions(form);
    var n = def.ranges.length;
    function rowCells(getter, rowClass) {
      var html = '';
      var i;
      var rc;
      for (i = 0; i < n; i++) {
        rc = i === activeIdx ? ' pt-cert-band-cell--active' : '';
        html +=
          '<div class="pt-cert-band-cell' +
          rc +
          '"><span class="pt-cert-band-cell-text">' +
          esc(getter(i)) +
          '</span></div>';
      }
      return '<div class="pt-cert-band-cells" style="--band-cols:' + n + '">' + html + '</div>';
    }
    return (
      '<div class="pt-cert-band-matrix" aria-label="Understanding the results: score bands, GSE, and CEFR">' +
      '<div class="pt-cert-band-row">' +
      '<div class="pt-cert-band-label">General test total score</div>' +
      rowCells(function(i) {
        return def.ranges[i];
      }) +
      '</div>' +
      '<div class="pt-cert-band-row pt-cert-band-row--dense">' +
      '<div class="pt-cert-band-label">GSE level</div>' +
      rowCells(function(i) {
        return def.gse && def.gse[i] != null ? def.gse[i] : '—';
      }) +
      '</div>' +
      '<div class="pt-cert-band-row pt-cert-band-row--cefr">' +
      '<div class="pt-cert-band-label">CEFR level</div>' +
      rowCells(function(i) {
        return def.cefrBand && def.cefrBand[i] != null ? def.cefrBand[i] : def.cefr[i];
      }) +
      '</div>' +
      '</div>'
    );
  }

  function buildSkillColumnsHtml(payload) {
    var form = payload.test_form || selectedForm;
    var L = payload.listening_score;
    var G = payload.grammar_score;
    var V = payload.vocabulary_score;
    var R = payload.reading_score;
    var cols = [
      { num: pad2(L), label: 'Listening Score', level: sectionLevelFromRaw(L, 20, form), max: '20', mod: 'pt-cert-skill-col--a' },
      { num: pad2(G), label: 'Grammar Score', level: sectionLevelFromRaw(G, 30, form), max: '30', mod: 'pt-cert-skill-col--b' },
      { num: pad2(V), label: 'Vocabulary Score', level: sectionLevelFromRaw(V, 20, form), max: '20', mod: 'pt-cert-skill-col--c' },
      { num: pad2(R), label: 'Reading Score', level: sectionLevelFromRaw(R, 10, form), max: '10', mod: 'pt-cert-skill-col--d' }
    ];
    return cols.map(function(c) {
      return (
        '<div class="pt-cert-skill-col ' + c.mod + '">' +
        '<div class="pt-cert-skill-num">' + esc(c.num) + '</div>' +
        '<div class="pt-cert-skill-label">' + esc(c.label) + '</div>' +
        '<div class="pt-cert-skill-level">' + esc(c.level) + '</div>' +
        '<div class="pt-cert-skill-max">out of ' + c.max + '</div>' +
        '</div>'
      );
    }).join('');
  }

  function esc(v) { return String(v || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var REVIEW_HEADER_INLINE_RE =
    /^[\uF0B7\u2022\u25A1\u2610\u25AA\uF097\-\*\s\u00A0]*([A-Z]\.\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s*\([^)]+\))\s+([\s\S]+)$/;
  var REVIEW_HEADER_ONLY_RE =
    /^[\uF0B7\u2022\u25A1\u2610\u25AA\uF097\-\*\s\u00A0]*([A-Z]\.\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s*\([^)]+\))$/;

  function stripReviewBullet(s) {
    return String(s || '').replace(/^[\uF0B7\u2022\u25A1\u2610\u25AA\uF097\-\*\s\u00A0]+/, '').trim();
  }

  function formatReviewBlockHtml(header, body) {
    return (
      '<div class="passage-review-block">' +
      '<p class="passage-review-header">' +
      esc(stripReviewBullet(header)) +
      '</p>' +
      '<p class="passage-review-body">' +
      esc(String(body || '').trim()).replace(/\n/g, '<br>') +
      '</p>' +
      '</div>'
    );
  }

  /** One paragraph; ALL-CAPS section labels (e.g. MUSEUMS:) render bold. */
  function formatPassageParagraphHtml(para) {
    var p = String(para || '').trim();
    if (!p) return '';
    var reviewInline = p.match(REVIEW_HEADER_INLINE_RE);
    if (reviewInline) {
      return formatReviewBlockHtml(reviewInline[1], reviewInline[2]);
    }
    var reviewOnly = p.match(REVIEW_HEADER_ONLY_RE);
    if (reviewOnly) {
      return '<p class="passage-review-header passage-review-header--solo">' + esc(stripReviewBullet(reviewOnly[1])) + '</p>';
    }
    var section = p.match(/^([A-Z][A-Z0-9]{1,11}):\s*(.+)$/);
    if (section) {
      return (
        '<p class="passage-body-p passage-section-p">' +
        '<strong class="passage-section-label">' +
        esc(section[1] + ':') +
        '</strong> ' +
        esc(section[2].trim()).replace(/\n/g, '<br>') +
        '</p>'
      );
    }
    return '<p class="passage-body-p">' + esc(p).replace(/\n/g, '<br>') + '</p>';
  }

  /** Split stored passage into paragraphs (blank lines, or MUSEUMS:/SLEEP:/SWIM: blocks). */
  function normalizePassageParagraphs(text) {
    var raw = String(text || '').trim();
    if (!raw) return [];
    if (/\n\s*\n/.test(raw)) {
      return raw
        .split(/\n\s*\n+/)
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    }
    if (/\b(MUSEUMS|SLEEP|SWIM):\s/i.test(raw)) {
      return raw
        .split(/\s+(?=(?:MUSEUMS|SLEEP|SWIM):)/i)
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    }
    return [raw];
  }

  function splitPassageReviewSegments(text) {
    var raw = String(text || '').trim();
    if (!raw || !/[A-Z]\.\s+[A-Za-z]+\s*\(/.test(raw)) return [raw];
    return raw
      .split(/(?=[\uF0B7\u2022\u25A1\u2610\u25AA\uF097]?\s*[A-Z]\.\s+[A-Za-z]+\s*\([^)]+\))/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function splitPassageReviewLines(part) {
    var raw = String(part || '').trim();
    if (!raw || !/\r?\n/.test(raw)) return [raw];
    var lines = raw
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
    if (lines.length <= 1) return [raw];
    var segments = [];
    var buf = [];
    lines.forEach(function (line) {
      if (REVIEW_HEADER_ONLY_RE.test(line) || REVIEW_HEADER_INLINE_RE.test(line)) {
        if (buf.length) {
          segments.push(buf.join(' '));
          buf = [];
        }
        segments.push(line);
      } else if (segments.length && REVIEW_HEADER_ONLY_RE.test(segments[segments.length - 1])) {
        segments.push(line);
      } else {
        buf.push(line);
      }
    });
    if (buf.length) segments.push(buf.join(' '));
    return segments.filter(Boolean);
  }

  function mergeReviewHeaderBodyParts(parts) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = String(parts[i] || '').trim();
      if (!p) continue;
      if (REVIEW_HEADER_INLINE_RE.test(p)) {
        out.push(p);
        continue;
      }
      if (REVIEW_HEADER_ONLY_RE.test(p) && i + 1 < parts.length) {
        var next = String(parts[i + 1] || '').trim();
        if (
          next &&
          !REVIEW_HEADER_ONLY_RE.test(next) &&
          !REVIEW_HEADER_INLINE_RE.test(next) &&
          !/^(MUSEUMS|SLEEP|SWIM):/i.test(next)
        ) {
          out.push(stripReviewBullet(p.match(REVIEW_HEADER_ONLY_RE)[1]) + ' ' + next);
          i += 1;
          continue;
        }
      }
      out.push(p);
    }
    return out;
  }

  /** Split passage on blank lines into separate paragraphs. */
  function formatPassageBodyHtml(body) {
    var parts = [];
    normalizePassageParagraphs(body).forEach(function (part) {
      splitPassageReviewSegments(part).forEach(function (seg) {
        splitPassageReviewLines(seg).forEach(function (linePart) {
          parts.push(linePart);
        });
      });
    });
    parts = mergeReviewHeaderBodyParts(parts);
    if (!parts.length) return '';
    return parts.map(formatPassageParagraphHtml).join('');
  }

  function formatPassageContentHtml(text) {
    var raw = String(text || '').trim();
    if (!raw) return '';
    var lines = raw.split('\n');
    var fromVal = '';
    var toVal = '';
    var body = raw;
    var mFrom = lines[0] && lines[0].match(/^From:\s*(.+)$/i);
    var mTo = lines[1] && lines[1].match(/^To:\s*(.+)$/i);
    if (mFrom && mTo) {
      fromVal = mFrom[1].trim();
      toVal = mTo[1].trim();
      body = lines.slice(2).join('\n').replace(/^\s*\n+/, '').trim();
    } else {
      var inline = raw.match(/^From:\s*(.+?)\s+To:\s*(.+?)(?:\n\n|[\r\n]{2,}|$)([\s\S]*)$/i);
      if (inline) {
        fromVal = inline[1].trim();
        toVal = inline[2].trim();
        body = (inline[3] || '').trim();
      }
    }
    if (fromVal && toVal) {
      return (
        '<div class="passage-email-meta">' +
        '<div class="passage-email-row"><span class="passage-email-label">From:</span><span class="passage-email-chip">' +
        esc(fromVal) +
        '</span></div>' +
        '<div class="passage-email-row"><span class="passage-email-label">To:</span><span class="passage-email-chip">' +
        esc(toVal) +
        '</span></div></div>' +
        formatPassageBodyHtml(body)
      );
    }
    return formatPassageBodyHtml(raw);
  }
  function byId(id) { return document.getElementById(id); }
  function mmss(s) {
    var n = Math.max(0, parseInt(s, 10) || 0);
    var m = Math.floor(n / 60), r = n % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  function makeId() { return 'pt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

  function normalizePhoneInput(raw) {
    return String(raw || '')
      .replace(/[^\d+\s()\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30);
  }
  function isValidPhoneNumber(value) {
    var s = String(value || '').trim();
    if (s.length < 7 || s.length > 30) return false;
    var digits = s.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return false;
    return /^[+\d()\-.\s]+$/.test(s);
  }
  function applyCountryPrefixIfNeeded() {
    var phoneEl = byId('pPhone');
    var countryEl = byId('pPhoneCountry');
    if (!phoneEl || !countryEl) return;
    var prefix = String(countryEl.value || '').trim();
    if (!prefix) return;
    var current = normalizePhoneInput(phoneEl.value);
    if (!current) {
      phoneEl.value = prefix;
      return;
    }
    if (current.charAt(0) === '+') {
      var restAfterIntl = current.replace(/^\+\d{1,4}\s*/, '');
      phoneEl.value = prefix + (restAfterIntl ? (' ' + restAfterIntl) : '');
      return;
    }
    if (/^0\d+/.test(current)) {
      phoneEl.value = prefix + ' ' + current.replace(/^0+/, '');
      return;
    }
    phoneEl.value = prefix + ' ' + current;
  }

  function updatePhoneFlagDisplay() {
    var countryEl = byId('pPhoneCountry');
    var flagImgEl = byId('pPhoneFlagImg');
    if (!countryEl || !flagImgEl) return;
    var opt = countryEl.options[countryEl.selectedIndex];
    var code = opt ? String(opt.getAttribute('data-flag-code') || '').toLowerCase() : '';
    flagImgEl.src = code ? ('https://flagcdn.com/24x18/' + code + '.png') : 'https://flagcdn.com/24x18/un.png';
  }
  function isValidEnglishStudentName(name) {
    var s = String(name || '').trim();
    if (!s || s.length > 200) return false;
    return /^[A-Za-z]+(?:[ '.-][A-Za-z]+)*$/.test(s);
  }

  var BreBank = window.BrePlacementBank;
  var DEFAULT_TEST_BANKS = BreBank && BreBank.getDefaultBanks ? BreBank.getDefaultBanks() : { test1a: { title: '', audioUrl: '', passages: {}, questions: [] }, test2a: { title: '', audioUrl: '', passages: {}, questions: [] } };
  var TEST_BANKS = {
    test1a: BreBank && BreBank.normalizeBreBank ? BreBank.normalizeBreBank(DEFAULT_TEST_BANKS.test1a) : DEFAULT_TEST_BANKS.test1a,
    test2a: BreBank && BreBank.normalizeBreBank ? BreBank.normalizeBreBank(DEFAULT_TEST_BANKS.test2a) : DEFAULT_TEST_BANKS.test2a
  };

  function applyCmsBanks(data) {
    if (!BreBank || !data || typeof data !== 'object') return;
    ['test1a', 'test2a'].forEach(function(key) {
      var b = data[key];
      if (BreBank.isValidBreBank && BreBank.isValidBreBank(b)) {
        TEST_BANKS[key] = BreBank.normalizeBreBank(b);
      }
    });
  }

  function loadCmsBanks(cb) {
    var done = typeof cb === 'function' ? cb : function() {};
    if (!window.SchoolAPI || !SchoolAPI.getPlacementQuestionBank) {
      done();
      return;
    }
    SchoolAPI.getPlacementQuestionBank()
      .then(function(data) {
        applyCmsBanks(data);
        done();
      })
      .catch(function() {
        done();
      });
  }

  /* Question banks: placement-bre-bank-core.js (defaults) + placement_question_bank via loadCmsBanks */

  function getBank() { return TEST_BANKS[selectedForm] || TEST_BANKS.test1a; }

  function updateAdaptiveRoundBanner() {
    var el = byId('ptAdaptiveRoundBanner');
    if (!el) return;
    if (selectedForm === 'test2a' && currentStep === 2) {
      el.style.display = '';
      el.textContent =
        'Test 2A (B1–B2+): You scored ' +
        ADAPTIVE_THRESHOLD_TO_TEST2A +
        '+ out of 80 on Test 1A. Please complete this second paper for your final online band.';
    } else {
      el.style.display = 'none';
      el.textContent = '';
    }
  }
  function getCurrentQuestion() { return getBank().questions[currentIndex] || null; }
  function isListeningQ(q) { return q && q.no <= LISTENING_COUNT; }
  function stopListeningAudio() {
    var audio = byId('listeningAudio');
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (e) {}
  }
  // Keep listening audio lazy so browser does not download mp3 until user presses Play.
  function deferListeningAudio(url) {
    var audio = byId('listeningAudio');
    if (!audio) return;
    var u = String(url || '').trim();
    audio.setAttribute('data-src', u);
    try {
      audio.removeAttribute('src');
      audio.load();
    } catch (e) {}
  }
  function ensureListeningAudioSource() {
    var audio = byId('listeningAudio');
    if (!audio) return false;
    if (audio.src) return true;
    var pending = String(audio.getAttribute('data-src') || '').trim();
    if (!pending) return false;
    audio.src = pending;
    try { audio.load(); } catch (e) {}
    return true;
  }
  function sectionTitleHtml(no) {
    if (no <= 20) return 'SECTION 1: <span class="pt-section-title-skill">LISTENING</span> (Questions 1-20)';
    if (no <= 50) return 'SECTION 2: <span class="pt-section-title-skill">GRAMMAR</span> (Questions 21-50)';
    if (no <= 70) return 'SECTION 3: <span class="pt-section-title-skill">VOCABULARY</span> (Questions 51-70)';
    return 'SECTION 4: <span class="pt-section-title-skill">READING</span> (Questions 71-80)';
  }

  function setStep(n) {
    currentStep = n;
    var row = document.querySelector('.placement-step1-row');
    var main = document.querySelector('.placement-main');
    if (row) row.style.display = n === 1 ? '' : 'none';
    if (main) main.style.display = n === 1 ? 'none' : '';
    var s2 = byId('step2'), s6 = byId('step6');
    if (s2) s2.classList.toggle('active', n === 2);
    if (s6) s6.classList.toggle('active', n === 3);
    if (n === 1) updateAdaptiveRoundBanner();
    if (n === 2) {
      var intro = byId('step2Intro');
      var wrap = byId('step2QuestionsWrap');
      if (intro) intro.style.display = 'none';
      if (wrap) wrap.style.display = '';
      updateAdaptiveRoundBanner();
      renderQuestion();
      return;
    }
  }

  function updateTimer() {
    var el = byId('ptExamTimerLabel');
    if (el) el.innerHTML = 'Time Remaining: <span class="content-duration-mins">' + mmss(timeLeft) + '</span>';
    if (timeLeft <= 0) submitTest();
  }

  function startTimer() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(function() {
      timeLeft--;
      updateTimer();
      if (timeLeft <= 0) {
        clearInterval(timerId);
        timerId = null;
      }
    }, 1000);
  }

  function renderNavigator() {
    var nav = byId('step2Navigator');
    if (!nav) return;
    function sectionClass(no) {
      if (no <= 20) return ' sec-listening';
      if (no <= 50) return ' sec-grammar';
      if (no <= 70) return ' sec-vocabulary';
      return ' sec-reading';
    }
    nav.innerHTML = getBank().questions.map(function(q, i) {
      var isCurrent = i === currentIndex;
      var isAnswered = !!answers[i];
      var cls = 'pt-nav-btn' + sectionClass(q.no) + (isCurrent ? ' current' : '') + (isAnswered ? ' answered' : '');
      var mark = isCurrent ? '◉' : (isAnswered ? '●' : '○');
      return '<button type="button" class="' + cls + '" data-qidx="' + i + '">' + q.no + ' ' + mark + '</button>';
    }).join('');
  }

  function updateProgress() {
    var answered = answers.filter(function(v) { return !!v; }).length;
    var wrap = byId('ptExamProgressLabel');
    if (wrap) {
      var a = wrap.querySelector('.pt-progress-answered');
      var t = wrap.querySelector('.pt-progress-total');
      if (a && t) {
        a.textContent = String(answered);
        t.textContent = String(TOTAL_COUNT);
      } else {
        wrap.textContent = answered + '/' + TOTAL_COUNT;
      }
    }
    byId('ptExamProgressBar').style.width = ((answered / TOTAL_COUNT) * 100).toFixed(1) + '%';
  }

  function renderQuestion() {
    var q = getCurrentQuestion();
    if (!q) return;
    var counter = byId('step2QuestionCounter');
    var box = byId('step2Questions');
    var title = document.querySelector('.pt-section-title');
    var instruction = byId('ptStep2Instruction');
    var selected = answers[currentIndex] || '';
    var passageText = q.passageId ? (getBank().passages[q.passageId] || '') : '';
    if (counter) counter.textContent = 'Question ' + q.no + ' of ' + TOTAL_COUNT;
    if (title) title.innerHTML = sectionTitleHtml(q.no);
    if (instruction) {
      instruction.textContent = isListeningQ(q)
        ? 'Listen and answer. You can play the full audio one time.'
        : 'Choose the correct answer.';
    }
    var passageHtml = passageText
      ? '<div class="passage-box"><strong class="passage-box-title">Reading Passage</strong>' + formatPassageContentHtml(passageText) + '</div>'
      : '';
    var opts = q.options.map(function(o) {
      var checked = selected === o.key ? ' checked' : '';
      return (
        '<label class="pt-option-box" data-opt-key="' + esc(o.key) + '">' +
          '<input type="radio" name="exam_current" value="' + esc(o.key) + '"' + checked + '>' +
          '<span class="pt-opt-pill" aria-hidden="true">' + esc(o.key) + '</span>' +
          '<span class="opt-text">' + esc(o.text) + '</span>' +
        '</label>'
      );
    }).join('');
    box.innerHTML = passageHtml + '<p class="pt-question-text">' + esc(q.prompt) + '</p><div class="pt-options">' + opts + '</div>';

    var audioRow = document.querySelector('.step2-audio-row');
    var listening = isListeningQ(q);
    var nextBtn = byId('step2NextBtn');
    if (!listening) stopListeningAudio();
    if (audioRow) audioRow.style.display = listening ? '' : 'none';
    byId('step2PrevBtn').disabled = currentIndex === 0;
    if (nextBtn) nextBtn.textContent = (currentIndex === TOTAL_COUNT - 1) ? 'SUBMIT' : ('NEXT ' + '\u25B6');
    renderNavigator();
    updateProgress();
    updateAdaptiveRoundBanner();
  }

  function calculateScores() {
    var qs = getBank().questions;
    var raw = { listening: 0, grammar: 0, vocabulary: 0, reading: 0 };
    for (var i = 0; i < qs.length; i++) {
      if (answers[i] !== qs[i].correct) continue;
      if (qs[i].no <= 20) raw.listening++;
      else if (qs[i].no <= 50) raw.grammar++;
      else if (qs[i].no <= 70) raw.vocabulary++;
      else raw.reading++;
    }
    var listening_score = raw.listening;
    var grammar_score = raw.grammar;
    var vocabulary_score = raw.vocabulary;
    var reading_score = raw.reading;
    var totalOnline = listening_score + grammar_score + vocabulary_score + reading_score;
    var total_scaled = Math.round((totalOnline / ONLINE_POINTS_MAX) * 100);
    if (total_scaled > 100) total_scaled = 100;
    return {
      listening_raw: raw.listening,
      grammar_raw: raw.grammar,
      vocabulary_raw: raw.vocabulary,
      reading_raw: raw.reading,
      listening_score: listening_score,
      grammar_score: grammar_score,
      vocabulary_score: vocabulary_score,
      reading_score: reading_score,
      total_online_points: totalOnline,
      total_score: total_scaled
    };
  }

  function buildTest1SnapshotForStorage(scoresPre) {
    var scores = scoresPre || calculateScores();
    var i;
    var la = [];
    var ra = [];
    for (i = 0; i < 20; i++) la.push(answers[i] != null ? answers[i] : '');
    for (i = 20; i < TOTAL_COUNT; i++) ra.push(answers[i] != null ? answers[i] : '');
    return {
      test_form: 'test1a',
      listening_answers: la,
      reading_answers: ra,
      listening_score: scores.listening_score,
      grammar_score: scores.grammar_score,
      vocabulary_score: scores.vocabulary_score,
      reading_score: scores.reading_score,
      total_online_points: scores.total_online_points
    };
  }

  function attachTest1SnapshotToPayload(payload) {
    if (selectedForm !== 'test2a') {
      try {
        localStorage.removeItem(TEST1_SNAPSHOT_LS_KEY);
      } catch (e) {}
      return;
    }
    try {
      var raw = localStorage.getItem(TEST1_SNAPSHOT_LS_KEY);
      if (raw) {
        var snap = JSON.parse(raw);
        if (snap && typeof snap === 'object' && String(snap.test_form || '').toLowerCase() === 'test1a') {
          payload.test1_snapshot = snap;
        }
      }
    } catch (e1) {}
    try {
      localStorage.removeItem(TEST1_SNAPSHOT_LS_KEY);
    } catch (e2) {}
  }

  function buildPayload(scoresPre) {
    var scores = scoresPre || calculateScores();
    var result_status = scores.total_score >= PASSING_SCORE ? 'PASS' : 'FAIL';
    var payload = {
      client_submission_id: makeId(),
      name: byId('pName').value || '',
      student_name: byId('pName').value || '',
      phone: normalizePhoneInput(byId('pPhone').value),
      email: byId('pEmail').value || '',
      date_of_birth: getDobValue(),
      education: byId('pEducation').value || '',
      parent_name: byId('pParentName').value || '',
      test_form: selectedForm,
      grammar_score: scores.grammar_score,
      vocabulary_score: scores.vocabulary_score,
      listening_score: scores.listening_score,
      reading_score: scores.reading_score,
      total_online_points: scores.total_online_points,
      total_score: scores.total_score,
      suggested_level: cefrFromRaw80(scores.total_online_points, selectedForm),
      result_status: result_status,
      listening_answers: answers.slice(0, 20),
      reading_answers: answers.slice(20),
      submittedAt: new Date().toISOString()
    };
    attachTest1SnapshotToPayload(payload);
    return payload;
  }

  function buildCertificationHtml(payload, contact) {
    var form = payload.test_form || selectedForm;
    var raw80 = totalOnlinePointsFromPayload(payload);
    var name = esc((payload.student_name || payload.name || '').trim() || 'Student');
    var totalRawDisp = formatTotalOutOf80(raw80);
    var level = esc(payload.suggested_level || cefrFromRaw80(raw80, form));
    var band = bandSummaryFromPayload(payload);
    var awarded = esc(formatAwardDate(payload.submittedAt));
    var bIdx = bandIndexFromRaw80(raw80, form);
    var paperNamePlain = form === 'test1a' ? 'General Test 1' : 'General Test 2';
    var skillsRow =
      '<div class="pt-cert-skills-icons">' +
      '<div class="pt-cert-skill-icon-item">' + skillCheckSvg() + '<span>Listening</span></div>' +
      '<div class="pt-cert-skill-icon-item">' + skillCheckSvg() + '<span>Grammar</span></div>' +
      '<div class="pt-cert-skill-icon-item">' + skillCheckSvg() + '<span>Vocabulary</span></div>' +
      '<div class="pt-cert-skill-icon-item">' + skillCheckSvg() + '<span>Reading</span></div>' +
      '</div>';
    return (
      '<div class="pt-cert-document" data-cert-form="' + esc(form) + '">' +
      '<div class="pt-cert-stage pt-cert-stage--hero">' +
      '<div class="pt-cert-top">' +
      '<p class="pt-cert-title-line">' + esc(contact.schoolName) + '</p>' +
      '<p class="pt-cert-subtitle-hero">English Certification</p>' +
      '<p class="pt-cert-paper-line">' +
      '<span class="pt-cert-paper-name">' +
      esc(paperNamePlain) +
      '</span>' +
      '<span class="pt-cert-paper-rest"> — Form A (online MCQ)</span>' +
      '</p>' +
      '</div>' +
      '<h1 class="pt-cert-student pt-cert-student--hero">' + name + '</h1>' +
      '<p class="pt-cert-lead pt-cert-lead--hero">has partially completed the Certificate and has earned the following online level (Listening · Grammar · Vocabulary · Reading):</p>' +
      '<div class="pt-cert-diamond-stage">' +
      '<div class="pt-cert-diamond">' +
      '<div class="pt-cert-diamond-petals" aria-hidden="true"></div>' +
      '<div class="pt-cert-diamond-logo-stack" aria-hidden="true">' +
      '<img class="pt-cert-diamond-logo" src="../photo/logo.png" alt="" />' +
      '</div>' +
      '<div class="pt-cert-diamond-core">' +
      '<span class="pt-cert-diamond-score">' +
      esc(totalRawDisp) +
      '<span class="pt-cert-diamond-max">/80</span></span>' +
      '<span class="pt-cert-diamond-level">' +
      level +
      '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      skillsRow +
      '<p class="pt-cert-awarded pt-cert-awarded--center"><strong>Awarded on:</strong> ' + awarded + '</p>' +
      '<h2 class="pt-cert-h2">Understanding the results</h2>' +
      buildCertRangeGrids(bIdx, form) +
      '<p class="pt-cert-explainer">' +
      buildCertExplainer(form) +
      '</p>' +
      '</div>' +
      '<div class="pt-cert-stage pt-cert-stage--deck">' +
      '<div class="pt-cert-skill-deck">' +
      '<div class="pt-cert-skill-deck-inner">' + buildSkillColumnsHtml(payload) + '</div>' +
      '</div>' +
      '<div class="pt-cert-post-deck">' +
      '<div class="pt-cert-notice" role="region" aria-label="Important notice">' +
      '<h3 class="pt-cert-h3 pt-cert-h3--notice">Important notice</h3>' +
      '<ul class="pt-cert-notice-list">' +
      '<li>Writing &amp; Speaking NOT included online.</li>' +
      '<li>Come to the centre to complete them for your final level.</li>' +
      '</ul>' +
      '<div class="pt-cert-level-summary">' +
      '<div class="pt-cert-level-row">' +
      '<span class="pt-cert-level-k">Your online level</span>' +
      '<span class="pt-cert-level-v">' + level + ' (' + esc(band.range) + '/80)</span>' +
      '</div>' +
      '<div class="pt-cert-level-row">' +
      '<span class="pt-cert-level-k">Final level</span>' +
      '<span class="pt-cert-level-v pt-cert-level-v--pending">NOT YET DETERMINED</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<section class="pt-cert-follow">' +
      '<h3 class="pt-cert-h3 pt-cert-h3--section">Next step</h3>' +
      '<p class="pt-cert-para pt-cert-para--tight">Please call or visit the centre to schedule your <strong>Writing</strong> &amp; <strong>Speaking</strong> test appointment.</p>' +
      '<h3 class="pt-cert-h3 pt-cert-h3--section">Contact information</h3>' +
      '<dl class="pt-cert-contact-list">' +
      '<div class="pt-cert-contact-item"><dt>Centre Address</dt><dd>' + esc(contact.address) + '</dd></div>' +
      '<div class="pt-cert-contact-item"><dt>Phone Number</dt><dd>' + esc(contact.phone) + '</dd></div>' +
      '<div class="pt-cert-contact-item"><dt>Email</dt><dd>' + esc(contact.email) + '</dd></div>' +
      '<div class="pt-cert-contact-item"><dt>Office Hours</dt><dd>' + esc(contact.officeHours) + '</dd></div>' +
      '</dl>' +
      '</section></div></div></div>'
    );
  }

  function addCertCanvasToPdf(doc, canvas) {
    var margin = 8;
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var pdfW = pageW - margin * 2;
    var pdfInnerH = pageH - margin * 2;
    var cw = canvas.width;
    var ch = canvas.height;
    if (cw < 1 || ch < 1) return;
    var scale = pdfW / cw;
    var totalH = ch * scale;
    var offset = 0;
    var page = 0;
    while (offset < totalH - 0.5) {
      if (page > 0) doc.addPage();
      var slicePdfH = Math.min(pdfInnerH, totalH - offset);
      var srcY = offset / scale;
      var srcHpx = Math.min(slicePdfH / scale, ch - srcY);
      if (srcHpx < 1) break;
      var displayH = srcHpx * scale;
      var sc = document.createElement('canvas');
      sc.width = cw;
      sc.height = Math.max(1, Math.ceil(srcHpx));
      var cx = sc.getContext('2d');
      cx.fillStyle = '#ffffff';
      cx.fillRect(0, 0, sc.width, sc.height);
      cx.drawImage(canvas, 0, srcY, cw, srcHpx, 0, 0, cw, srcHpx);
      doc.addImage(sc.toDataURL('image/jpeg', 0.9), 'JPEG', margin, margin, pdfW, displayH);
      offset += displayH;
      page++;
    }
  }

  function certificatePdfFilename(payload, studentName) {
    var base = (String(studentName).replace(/[^a-zA-Z0-9_\-]+/g, '_') || 'student');
    var f = String((payload && payload.test_form) || '').toLowerCase();
    if (f === 'test1a') return base + '_General_Test1_FormA_english_certification.pdf';
    if (f === 'test2a') return base + '_General_Test2_FormA_english_certification.pdf';
    return base + '_english_certification.pdf';
  }

  /**
   * @param {object} [optionalPayload] If set (e.g. General Test 1 after adaptive path), generate PDF for that payload (text layout). If omitted, uses on-screen certificate (html2canvas when available).
   * @param {HTMLElement} [triggerBtn] Button to disable/restore during generation.
   */
  function downloadCertificatePdfBre(optionalPayload, triggerBtn) {
    var explicitPayload = arguments.length >= 1 && optionalPayload !== undefined;
    var payload = explicitPayload ? optionalPayload : lastCertPayload;
    if (!payload) {
      alert('Result not found.');
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library not available.');
      return;
    }
    var contact = schoolContactDefaults();
    var name = String(payload.student_name || payload.name || 'Student');
    var btn = triggerBtn || byId('ptDownloadCertificateBtn');
    var prevText = btn ? btn.textContent : '';
    function restoreBtn() {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevText || 'Download Certificate (PDF)';
      }
    }

    function runBreCertificatePdfFallback() {
      try {
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      var margin = 14;
      var pageW = doc.internal.pageSize.getWidth();
      var pageH = doc.internal.pageSize.getHeight();
      var maxW = pageW - margin * 2;
      var y;
      var cx = pageW / 2;

      y = margin;
      doc.setTextColor(26, 26, 26);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(contact.schoolName, cx, y + 4, { align: 'center' });
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(26, 26, 26);
      doc.setFontSize(11);
      doc.text('English Certification', cx, y + 11, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(45, 45, 45);
      y += 16;
      doc.setDrawColor(214, 40, 40);
      doc.setLineWidth(0.4);
      doc.line(margin, y, pageW - margin, y);
      y += 6;

      function ensureSpace(h) {
        if (y + h > pageH - margin) {
          doc.addPage();
          y = margin;
        }
      }
      function addLines(lines, fontSize, fontStyle) {
        var fs = fontSize || 10;
        doc.setFont('helvetica', fontStyle || 'normal');
        doc.setFontSize(fs);
        doc.setTextColor(40, 40, 40);
        var arr = Array.isArray(lines) ? lines : [lines];
        for (var i = 0; i < arr.length; i++) {
          var rawLine = String(arr[i] == null ? '' : arr[i]);
          if (rawLine === '') {
            y += fs * 0.35;
            continue;
          }
          var split = doc.splitTextToSize(rawLine, maxW);
          for (var j = 0; j < split.length; j++) {
            ensureSpace(fs * 0.55);
            doc.text(split[j], margin, y);
            y += fs * 0.52;
          }
        }
        y += 2;
      }
      function addLinesCenter(text, fontSize, fontStyle, colorRgb) {
        var fs = fontSize || 10;
        doc.setFont('helvetica', fontStyle || 'normal');
        doc.setFontSize(fs);
        if (colorRgb) doc.setTextColor(colorRgb[0], colorRgb[1], colorRgb[2]);
        else doc.setTextColor(40, 40, 40);
        var split = doc.splitTextToSize(String(text), maxW);
        for (var j = 0; j < split.length; j++) {
          ensureSpace(fs * 0.55);
          doc.text(split[j], cx, y, { align: 'center' });
          y += fs * 0.52;
        }
        y += 2;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(214, 40, 40);
      addLinesCenter(name, 13, 'bold', [214, 40, 40]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      addLinesCenter(
        'has partially completed the Certificate and has earned the following online level (Listening · Grammar · Vocabulary · Reading):',
        10,
        'normal',
        [40, 40, 40]
      );
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(158, 24, 24);
      doc.setFontSize(17);
      ensureSpace(10);
      doc.text(formatTotalOutOf80(totalOnlinePointsFromPayload(payload)) + '/80', cx, y, { align: 'center' });
      y += 8;
      doc.setFontSize(11);
      doc.text(String(payload.suggested_level || ''), cx, y, { align: 'center' });
      y += 9;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(10);
      addLines([
        'Online paper     : ' +
          (String(payload.test_form || '').toLowerCase() === 'test1a'
            ? 'General Test 1 — Form A'
            : 'General Test 2 — Form A'),
        '',
        'Listening        : ' + pad2(payload.listening_score) + '/20',
        'Grammar          : ' + pad2(payload.grammar_score) + '/30',
        'Vocabulary       : ' + pad2(payload.vocabulary_score) + '/20',
        'Reading          : ' + pad2(payload.reading_score) + '/10',
        '',
        'Awarded on: ' + formatAwardDate(payload.submittedAt),
        '',
        '------------------------------------------------------------------------------'
      ]);
      doc.setFont('helvetica', 'bold');
      addLinesCenter('Understanding the results', 10, 'bold', [26, 26, 26]);
      doc.setFont('helvetica', 'normal');
      addLines(certBandMatrixLinesForPdf(payload.test_form || selectedForm));
      var band = bandSummaryFromPayload(payload);
      doc.setTextColor(158, 24, 24);
      doc.setFont('helvetica', 'bold');
      addLines('Important notice', 10, 'bold');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      addLines([
        '• Writing & Speaking NOT included online.',
        '• Come to the centre to complete them for your final level.',
        '',
        'Your online level : ' +
          String(payload.suggested_level || '') +
          ' (' +
          band.range +
          '/80)',
        'Final level       : NOT YET DETERMINED',
        ''
      ]);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(158, 24, 24);
      addLines('Next step', 10, 'bold');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      addLines('Please call or visit the centre to schedule your Writing & Speaking test appointment.');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(158, 24, 24);
      addLines('Contact information', 10, 'bold');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      addLines([
        'Centre Address : ' + contact.address,
        'Phone Number : ' + contact.phone,
        'Email : ' + contact.email,
        'Office Hours : ' + contact.officeHours,
        '',
        'Thank you.',
        contact.schoolName
      ]);
      var filename = certificatePdfFilename(payload, name);
      doc.save(filename);
      } finally {
        restoreBtn();
      }
    }

    var certEl = document.querySelector('#ptStep6Message .pt-cert-document');
    var useDomCanvas =
      !explicitPayload &&
      window.html2canvas &&
      certEl &&
      certEl.getBoundingClientRect().height > 2;
    if (useDomCanvas) {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Preparing PDF…';
      }
      window
        .html2canvas(certEl, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          logging: false,
          scrollX: 0,
          scrollY: -window.scrollY,
          onclone: function(clonedDoc) {
            var st = clonedDoc.createElement('style');
            st.textContent = '.pt-cert-document::before{display:none!important;}';
            clonedDoc.head.appendChild(st);
          }
        })
        .then(function(canvas) {
          try {
            var jsPDF = window.jspdf.jsPDF;
            var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            addCertCanvasToPdf(doc, canvas);
            var filename = certificatePdfFilename(payload, name);
            doc.save(filename);
          } finally {
            restoreBtn();
          }
        })
        .catch(function(err) {
          console.warn('html2canvas PDF failed', err);
          runBreCertificatePdfFallback();
        });
      return;
    }
    if (explicitPayload && btn) {
      btn.disabled = true;
      btn.textContent = 'Preparing PDF…';
    }
    runBreCertificatePdfFallback();
  }

  function placementRecordTimeMs(s) {
    if (!s || typeof s !== 'object') return 0;
    var candidates = [s.updatedAt, s.updated_at, s.submittedAt, s.test_date, s.applied_date];
    var best = 0;
    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i];
      if (v == null || v === '') continue;
      var ms = new Date(v).getTime();
      if (!isNaN(ms) && ms > best) best = ms;
    }
    return best;
  }

  function mergePlacementPairBre(prev, record) {
    var tp = placementRecordTimeMs(prev);
    var tr = placementRecordTimeMs(record);
    var older = tr >= tp ? prev : record;
    var newer = tr >= tp ? record : prev;
    var merged = Object.assign({}, older, newer);
    if ((merged.writing == null || merged.writing === '') && (prev.writing || record.writing)) {
      merged.writing = (newer.writing != null && newer.writing !== '') ? newer.writing : (older.writing || merged.writing || '');
    }
    return merged;
  }

  function dedupePlacementListBre(list) {
    var byKey = {};
    var order = [];
    (list || []).forEach(function(raw) {
      var it = raw || {};
      var key;
      if (it.client_submission_id) key = 'cid:' + it.client_submission_id;
      else if (it._id) key = 'id:' + it._id;
      else key = 'legacy:' + [it.name || it.student_name || '', it.phone || '', it.submittedAt || ''].join('|');
      if (!byKey[key]) {
        byKey[key] = it;
        order.push(key);
      } else {
        byKey[key] = mergePlacementPairBre(byKey[key], it);
      }
    });
    return order.map(function(k) { return byKey[k]; });
  }

  function persistResult(payload) {
    try { localStorage.setItem('placement_test_submission', JSON.stringify(payload)); } catch (e) {}
    var apiPromise = Promise.resolve(false);
    if (window.SchoolAPI && SchoolAPI.getWebExtra && SchoolAPI.saveWebExtra) {
      apiPromise = SchoolAPI.getWebExtra('placement_test_results').then(function(r) {
        var list = (r && r.ok && Array.isArray(r.data)) ? r.data.slice() : [];
        var idx = -1;
        for (var i = 0; i < list.length; i++) {
          var it = list[i] || {};
          if (it.client_submission_id && payload.client_submission_id && it.client_submission_id === payload.client_submission_id) {
            idx = i; break;
          }
          var sameName = String(it.name || it.student_name || '') === String(payload.name || payload.student_name || '');
          var samePhone = String(it.phone || '') === String(payload.phone || '');
          var sameTime = String(it.submittedAt || '') === String(payload.submittedAt || '');
          if (sameName && samePhone && sameTime) { idx = i; break; }
        }
        if (idx >= 0) list[idx] = mergePlacementPairBre(list[idx], payload);
        else list.push(payload);
        list = dedupePlacementListBre(list);
        return SchoolAPI.saveWebExtra('placement_test_results', list).then(function(s) { return !!(s && s.ok); });
      }).catch(function() { return false; });
    }
    var firebasePromise = Promise.resolve(false);
    if (window.AcademyFirebase && AcademyFirebase.saveSubmission) {
      firebasePromise = new Promise(function(resolve) {
        AcademyFirebase.saveSubmission(payload, function(id) { resolve(!!id); });
      });
    }
    return Promise.all([apiPromise, firebasePromise]).then(function(results) {
      return !!(results[0] || results[1]);
    }).catch(function() { return false; });
  }

  function beginTest2ARound(scores) {
    lastRound1CertPayload = buildPayload(scores);
    try {
      localStorage.setItem(TEST1_SNAPSHOT_LS_KEY, JSON.stringify(buildTest1SnapshotForStorage(scores)));
    } catch (e) {}
    selectedForm = 'test2a';
    timeLeft = TEST_DURATION_SECONDS;
    updateTimer();
    startTimer();
    answers = new Array(TOTAL_COUNT).fill('');
    currentIndex = 0;
    playCount = 0;
    var playBtn = byId('step2PlayBtn');
    if (playBtn) playBtn.disabled = false;
    var pcl = byId('playCountLabel');
    if (pcl) pcl.textContent = 'Plays left: ' + listenLimit;
    var bank = getBank();
    deferListeningAudio(bank.audioUrl);
    updateAdaptiveRoundBanner();
    renderQuestion();
    updateProgress();
    var t1pts =
      scores && scores.total_online_points != null
        ? scores.total_online_points
        : ADAPTIVE_THRESHOLD_TO_TEST2A;
    alert(
      'You scored ' +
        t1pts +
        '/80 on Test 1A. You will now continue with Test 2A.\n\nWhen you finish Test 2, this page will show certificates for both papers: you can download your General Test 1 online result as well as your General Test 2 result (the usual certificate band chart matches Test 2).'
    );
  }

  function confirmSubmitMcqRound() {
    byId('ptSubmitModalOverlay').style.display = 'none';
    submitTest();
  }

  function submitTest() {
    try {
      localStorage.removeItem('placement_test_draft');
    } catch (e) {}
    stopListeningAudio();
    var scores = calculateScores();
    if (selectedForm === 'test1a' && scores.total_online_points >= ADAPTIVE_THRESHOLD_TO_TEST2A) {
      beginTest2ARound(scores);
      return;
    }
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    var payload = buildPayload(scores);
    lastCertPayload = payload;
    var contact = schoolContactDefaults();
    byId('ptStep6Message').innerHTML = buildCertificationHtml(payload, contact);
    byId('ptStep6ThankYou').textContent = 'Thank you.';
    var orgLine = byId('ptStep6OrgLine');
    if (orgLine) orgLine.textContent = contact.schoolName;
    var pdfBtn = byId('ptDownloadCertificateBtn');
    if (pdfBtn) {
      pdfBtn.style.display = '';
      pdfBtn.textContent = lastRound1CertPayload
        ? 'Download General Test 2 Certificate (PDF)'
        : 'Download Certificate (PDF)';
    }
    var pdfT1Btn = byId('ptDownloadCertificateTest1Btn');
    var dualNote = byId('ptStep6DualCertNote');
    if (lastRound1CertPayload) {
      if (pdfT1Btn) pdfT1Btn.style.display = '';
      if (dualNote) dualNote.style.display = 'block';
    } else {
      if (pdfT1Btn) pdfT1Btn.style.display = 'none';
      if (dualNote) dualNote.style.display = 'none';
    }
    persistResult(payload);
    recordAttemptOnSubmit(payload);
    setStep(3);
  }

  function getDobValue() {
    var d = byId('pDobDay'), m = byId('pDobMonth'), y = byId('pDobYear');
    if (!d || !m || !y || !d.value || !m.value || !y.value) return '';
    return y.value + '-' + m.value + '-' + d.value;
  }

  function fillDobDropdowns() {
    var day = byId('pDobDay'), month = byId('pDobMonth'), year = byId('pDobYear');
    if (!day || !month || !year || day.options.length > 1) return;
    var i;
    for (i = 1; i <= 31; i++) day.appendChild(new Option(i < 10 ? '0' + i : '' + i, i < 10 ? '0' + i : '' + i));
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    for (i = 0; i < 12; i++) month.appendChild(new Option(months[i], (i + 1 < 10 ? '0' : '') + (i + 1)));
    var y = new Date().getFullYear();
    for (i = y; i >= y - 80; i--) year.appendChild(new Option(String(i), String(i)));
  }

  function bindEvents() {
    var nameEl = byId('pName');
    var phoneEl = byId('pPhone');
    var phoneCountryEl = byId('pPhoneCountry');
    if (nameEl) {
      nameEl.addEventListener('input', function() {
        var v = nameEl.value.replace(/[^A-Za-z\s.'-]/g, '');
        if (v !== nameEl.value) nameEl.value = v;
      });
    }
    if (phoneEl) {
      phoneEl.addEventListener('input', function() {
        var v = normalizePhoneInput(phoneEl.value);
        if (v !== phoneEl.value) phoneEl.value = v;
      });
    }
    if (phoneCountryEl) {
      phoneCountryEl.addEventListener('change', applyCountryPrefixIfNeeded);
      phoneCountryEl.addEventListener('change', updatePhoneFlagDisplay);
      updatePhoneFlagDisplay();
    }

    function openSubmitModal() {
      var answered = answers.filter(function(v) { return !!v; }).length;
      var unanswered = TOTAL_COUNT - answered;
      var extra =
        selectedForm === 'test1a'
          ? ' If your score on this paper is ' +
            ADAPTIVE_THRESHOLD_TO_TEST2A +
            '/80 or higher, you will continue with Test 2 before receiving your certificate.'
          : '';
      byId('ptSubmitModalMessage').textContent =
        'You have answered ' +
        answered +
        ' out of ' +
        TOTAL_COUNT +
        ' questions. Unanswered: ' +
        unanswered +
        '. Are you sure you want to submit?' +
        extra;
      byId('ptSubmitModalOverlay').style.display = 'flex';
    }

    byId('step2Questions').addEventListener('change', function(e) {
      var t = e.target;
      if (!t || t.name !== 'exam_current') return;
      answers[currentIndex] = t.value;
      renderNavigator();
      updateProgress();
    });
    byId('step2PrevBtn').addEventListener('click', function() {
      if (currentIndex > 0) currentIndex--;
      renderQuestion();
    });
    byId('step2NextBtn').addEventListener('click', function() {
      if (currentIndex < TOTAL_COUNT - 1) {
        currentIndex++;
        renderQuestion();
      } else {
        openSubmitModal();
      }
    });
    byId('step2Navigator').addEventListener('click', function(e) {
      var btn = e.target && e.target.closest ? e.target.closest('button[data-qidx]') : null;
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-qidx'), 10);
      if (!isNaN(idx)) {
        currentIndex = idx;
        renderQuestion();
      }
    });
    byId('ptSubmitTestBtn').addEventListener('click', function() {
      openSubmitModal();
    });
    byId('ptSubmitModalCancel').addEventListener('click', function() { byId('ptSubmitModalOverlay').style.display = 'none'; });
    byId('ptSubmitModalClose').addEventListener('click', function() { byId('ptSubmitModalOverlay').style.display = 'none'; });
    byId('ptSubmitModalConfirm').addEventListener('click', confirmSubmitMcqRound);
    var certPdfBtn = byId('ptDownloadCertificateBtn');
    if (certPdfBtn) certPdfBtn.addEventListener('click', function() { downloadCertificatePdfBre(); });
    var certPdfBtnT1 = byId('ptDownloadCertificateTest1Btn');
    if (certPdfBtnT1) {
      certPdfBtnT1.addEventListener('click', function() {
        downloadCertificatePdfBre(lastRound1CertPayload, certPdfBtnT1);
      });
    }

    var audio = byId('listeningAudio');
    var playBtn = byId('step2PlayBtn');
    playBtn.addEventListener('click', function() {
      if (playCount >= listenLimit) return;
      if (!ensureListeningAudioSource()) return;
      audio.play();
    });
    audio.addEventListener('play', function() {
      playCount++;
      byId('playCountLabel').textContent = 'Plays left: ' + Math.max(0, listenLimit - playCount);
      if (playCount >= listenLimit) playBtn.disabled = true;
    });
    audio.addEventListener('timeupdate', function() {
      var t = audio.currentTime || 0, d = audio.duration || 0;
      byId('step2TimeDisplay').textContent = mmss(Math.floor(t)) + ' / ' + mmss(Math.floor(d));
    });
    audio.addEventListener('ended', function() {
      if (playCount >= listenLimit) playBtn.disabled = true;
    });

    byId('nextTo2').addEventListener('click', function() {
      var name = (byId('pName').value || '').trim();
      var phone = normalizePhoneInput(byId('pPhone').value);
      var parentName = (byId('pParentName') && byId('pParentName').value || '').trim();
      var dob = getDobValue();
      if (!name || !phone || !parentName) { alert('Please fill Student Name, Phone Number, and Parent Name.'); return; }
      if (!isValidEnglishStudentName(name)) {
        alert(
          'Student name must be in English only (letters A–Z). Spaces, hyphens (-), and apostrophes (\') between name parts are allowed.'
        );
        return;
      }
      if (!isValidPhoneNumber(phone)) {
        alert(
          'Please enter a valid phone number. International formats are accepted (e.g. +959..., +44..., 09...).'
        );
        return;
      }
      if (!dob) { alert('Please select Date of Birth.'); return; }
      applyCountryPrefixIfNeeded();
      checkRetakeEligibility({
        name: name,
        phone: phone,
        email: (byId('pEmail') && byId('pEmail').value) ? String(byId('pEmail').value).trim() : '',
        date_of_birth: dob,
        parent_name: parentName
      }).then(function(stat) {
        var canTake = !(stat && stat.ok === false) && !(stat && stat.can_take_test === false);
        if (!canTake) {
          var msg = String((stat && stat.message) || '');
          if (!msg) {
            if (stat && stat.days_until_next_attempt) {
              var rd = parseInt(stat.retake_days, 10);
              var period = (rd === 7) ? 'once per week' : ((rd === 1) ? 'once per day' : ('once every ' + (rd || 7) + ' days'));
              msg = 'You can take this test ' + period + ' (same date of birth, parent name, and phone or device). Try again in ' + stat.days_until_next_attempt + ' day(s).';
            } else {
              msg = 'You are not allowed to retake this test yet.';
            }
          }
          alert(msg);
          return;
        }
        startPlacementTestRound();
      }).catch(function() {
        startPlacementTestRound();
      });
    });

    function startPlacementTestRound() {
      lastRound1CertPayload = null;
      selectedForm = 'test1a';
      updateAdaptiveRoundBanner();
      var bank = getBank();
      answers = new Array(TOTAL_COUNT).fill('');
      currentIndex = 0;
      timeLeft = TEST_DURATION_SECONDS;
      playCount = 0;
      byId('playCountLabel').textContent = 'Plays left: ' + listenLimit;
      playBtn.disabled = false;
      deferListeningAudio(bank.audioUrl);
      setStep(2);
      renderQuestion();
      updateTimer();
      startTimer();
    }
  }

  function init() {
    fillDobDropdowns();
    setStep(1);
    function afterConfig() {
      loadCmsBanks(function() {
        bindEvents();
      });
    }
    if (window.AcademyContent && AcademyContent.getPlacementTestConfig) {
      AcademyContent.getPlacementTestConfig(function(pt) {
        applyAdaptiveThresholdFromConfig(pt);
        afterConfig();
      });
    } else {
      afterConfig();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

