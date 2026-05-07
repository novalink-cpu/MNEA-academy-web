(function() {
  'use strict';
  var currentStep = 1;
  var playCount = 0;
  var listenLimit = 2;
  var mediaRecorder = null;
  var chunks = [];
  var recordedBlob = null;
  var PASSING_SCORE = 21;
  var LISTENING_QUESTION_COUNT = 10;
  var READING_QUESTION_COUNT = 20;
  var ptConfig = null;
  var activeListeningQuestionIds = [];
  var activeReadingQuestionIds = [];
  var listeningQuestionIndex = 0;
  var listeningAnswers = [];
  var readingQuestionIndex = 0;
  var readingAnswers = [];
  var writingPromptIndex = 0;
  var writingAnswers = [];
  var writingPrompts = [];
  var readingTimerId = null;
  var writingTimerId = null;
  var listeningTimerId = null;
  var listeningSecondsLeft = 0;
  var readingSecondsLeft = 0;
  var writingSecondsLeft = 0;
  var isSubmitting = false;
  var latestResultPayload = null;
  var micStream = null;
  var speakingPhase = '';
  var recordTimerId = null;
  var recordSecondsLeft = 0;
  var speakingEnabled = true;
  var speakingRecordSeconds = 15;
  var speakingInstructionText = '';

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el && text != null) el.textContent = text;
  }

  function setHtml(id, html) {
    var el = document.getElementById(id);
    if (el && html != null) el.innerHTML = html;
  }

  function cloneJson(obj) {
    try { return JSON.parse(JSON.stringify(obj || {})); } catch (e) { return obj || {}; }
  }

  function normalizePhoneInput(raw) {
    return String(raw || '')
      .replace(/[^\d+\s()\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30);
  }

  function applyCountryPrefixIfNeeded() {
    var phoneEl = document.getElementById('pPhone');
    var countryEl = document.getElementById('pPhoneCountry');
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
    var countryEl = document.getElementById('pPhoneCountry');
    var flagImgEl = document.getElementById('pPhoneFlagImg');
    if (!countryEl || !flagImgEl) return;
    var opt = countryEl.options[countryEl.selectedIndex];
    var code = opt ? String(opt.getAttribute('data-flag-code') || '').toLowerCase() : '';
    flagImgEl.src = code ? ('https://flagcdn.com/24x18/' + code + '.png') : 'https://flagcdn.com/24x18/un.png';
  }

  function shuffleArray(arr) {
    var a = Array.isArray(arr) ? arr.slice() : [];
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function randomSubset(arr, count) {
    var a = shuffleArray(Array.isArray(arr) ? arr : []);
    var n = Math.max(0, Math.min(a.length, parseInt(count, 10) || 0));
    return a.slice(0, n);
  }

  function ensureQuestionId(question, prefix, idx) {
    var q = question || {};
    if (!q.id) q.id = (prefix || 'q') + '_' + (idx + 1) + '_' + Math.random().toString(36).slice(2, 8);
    return q;
  }

  function shuffleQuestionOptions(question) {
    var q = question || {};
    var options = Array.isArray(q.options) ? q.options.slice() : [];
    var originalCorrect = String(q.correct || '').toUpperCase();
    options = options.map(function(opt, idx) {
      var o = opt || {};
      var key = String(o.key || String.fromCharCode(65 + idx)).toUpperCase().slice(0, 1);
      return {
        original_key: key,
        text: String(o.text || ''),
        is_correct: key === originalCorrect
      };
    });
    options = shuffleArray(options).map(function(o, idx) {
      return {
        key: String.fromCharCode(65 + idx),
        text: o.text,
        _is_correct: !!o.is_correct
      };
    });
    var newCorrect = 'A';
    for (var i = 0; i < options.length; i++) {
      if (options[i]._is_correct) { newCorrect = options[i].key; break; }
    }
    q.options = options.map(function(o) { return { key: o.key, text: o.text }; });
    q.correct = newCorrect;
    return q;
  }

  function prepareStudentQuestionSession(cfg) {
    var out = cloneJson(cfg || {});
    if (!out.step2) out.step2 = {};
    if (!out.step3) out.step3 = {};
    var listening = Array.isArray(out.step2.questions) ? out.step2.questions : [];
    var reading = Array.isArray(out.step3.items) ? out.step3.items : [];
    listening = listening.map(function(q, idx) { return ensureQuestionId(cloneJson(q), 'listening', idx); }).filter(function(q) { return q.enabled !== false; });
    reading = reading.map(function(q, idx) { return ensureQuestionId(cloneJson(q), 'reading', idx); }).filter(function(q) { return q.enabled !== false; });
    listening = randomSubset(listening, LISTENING_QUESTION_COUNT).map(shuffleQuestionOptions);
    reading = randomSubset(reading, READING_QUESTION_COUNT).map(shuffleQuestionOptions);
    out.step2.questions = listening;
    out.step3.items = reading;
    activeListeningQuestionIds = listening.map(function(q) { return String(q.id || ''); });
    activeReadingQuestionIds = reading.map(function(q) { return String(q.id || ''); });
    return out;
  }

  function normalizeQuestionBankQuestion(item, isReading) {
    var it = item || {};
    var text = it.question != null ? it.question : (it.sentence != null ? it.sentence : (it.text != null ? it.text : ''));
    var options = Array.isArray(it.options) ? it.options : [];
    var normalizedOptions = [];
    for (var i = 0; i < 4; i++) {
      var o = options[i] || {};
      var key = String((o.key || String.fromCharCode(65 + i))).toUpperCase().slice(0, 1);
      normalizedOptions.push({ key: key, text: String(o.text || '') });
    }
    var out = {
      id: String(it.id || ('q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6))),
      options: normalizedOptions,
      correct: String((it.correct || 'A')).toUpperCase().slice(0, 1),
      enabled: it.enabled !== false
    };
    if (isReading) out.sentence = String(text || '');
    else out.question = String(text || '');
    return out;
  }

  function normalizeQuestionBankPrompt(item) {
    var it = item || {};
    return {
      id: String(it.id || ('w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6))),
      text: String(it.text || it.prompt || ''),
      targetWords: Math.max(1, parseInt(it.targetWords || it.target || 20, 10) || 20),
      enabled: it.enabled !== false
    };
  }

  function bankFromConfig(cfg) {
    var c = cfg || {};
    var step2 = c.step2 || {};
    var step3 = c.step3 || {};
    var step4 = c.step4 || {};
    var listening = (Array.isArray(step2.questions) ? step2.questions : []).map(function(q) { return normalizeQuestionBankQuestion(q, false); });
    var reading = (Array.isArray(step3.items) ? step3.items : []).map(function(q) { return normalizeQuestionBankQuestion(q, true); });
    var writing = (Array.isArray(step4.prompts) ? step4.prompts : []).map(function(p) { return normalizeQuestionBankPrompt(p); });
    return { listening: listening, reading: reading, writing: writing, updatedAt: new Date().toISOString() };
  }

  function configWithQuestionBank(baseCfg, bank) {
    var cfg = cloneJson(baseCfg || {});
    var b = bank || {};
    if (!cfg.step2) cfg.step2 = {};
    if (!cfg.step3) cfg.step3 = {};
    if (!cfg.step4) cfg.step4 = {};
    var listening = (Array.isArray(b.listening) ? b.listening : []).map(function(q) { return normalizeQuestionBankQuestion(q, false); }).filter(function(q) { return q.enabled !== false; });
    var reading = (Array.isArray(b.reading) ? b.reading : []).map(function(q) { return normalizeQuestionBankQuestion(q, true); }).filter(function(q) { return q.enabled !== false; });
    var writing = (Array.isArray(b.writing) ? b.writing : []).map(normalizeQuestionBankPrompt).filter(function(p) { return p.enabled !== false; });
    if (listening.length) cfg.step2.questions = listening;
    if (reading.length) cfg.step3.items = reading;
    if (writing.length) cfg.step4.prompts = writing;
    return cfg;
  }

  function loadPlacementConfigWithQuestionBank(baseCfg, callback) {
    callback(baseCfg || null);
  }

  function formatSecondsMMSS(totalSeconds) {
    var sec = Math.max(0, parseInt(totalSeconds, 10) || 0);
    var mm = Math.floor(sec / 60);
    var ss = sec % 60;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function parseDurationToSeconds(durationText, fallbackSeconds) {
    var t = String(durationText || '').toLowerCase();
    var n = parseInt(t, 10);
    if (isNaN(n) || n <= 0) return fallbackSeconds;
    if (t.indexOf('sec') >= 0 || t.indexOf('second') >= 0) return n;
    return n * 60;
  }

  function parseDurationToMinutes(durationText, fallbackMinutes) {
    var t = String(durationText || '').toLowerCase();
    var n = parseInt(t, 10);
    if (isNaN(n) || n <= 0) return fallbackMinutes;
    if (t.indexOf('sec') >= 0 || t.indexOf('second') >= 0) return Math.max(1, Math.ceil(n / 60));
    return n;
  }

  function getWritingPerPromptMinutes(cfg) {
    var step4 = cfg && cfg.step4 ? cfg.step4 : {};
    var fromConfig = parseInt(step4.promptDurationMinutes, 10);
    if (!isNaN(fromConfig) && fromConfig > 0) return fromConfig;
    var prompts = Array.isArray(step4.prompts) ? step4.prompts : [];
    if (prompts.length && prompts[0] && parseInt(prompts[0].durationMinutes, 10) > 0) {
      return parseInt(prompts[0].durationMinutes, 10);
    }
    return 20;
  }

  function getWritingTotalSeconds(cfg, prompts) {
    var p = Array.isArray(prompts) ? prompts : (Array.isArray(writingPrompts) ? writingPrompts : []);
    var perPromptMinutes = getWritingPerPromptMinutes(cfg);
    var totalPromptCount = p.length || 1;
    return totalPromptCount * perPromptMinutes * 60;
  }

  function getSpeakingRecordSeconds(cfg) {
    var step5 = cfg && cfg.step5 ? cfg.step5 : {};
    var allowed = [15, 30, 45, 60];
    var n = parseInt(step5.recordSeconds, 10);
    if (isNaN(n) || allowed.indexOf(n) < 0) n = 15;
    return n;
  }

  function updateListeningTimerDisplay() {
    var timerEl = document.getElementById('ptStep2Duration');
    if (timerEl) timerEl.textContent = 'Time left: ' + formatSecondsMMSS(listeningSecondsLeft);
    var examTimerEl = document.getElementById('ptExamTimerLabel');
    if (examTimerEl) examTimerEl.textContent = 'Time Remaining: ' + formatSecondsMMSS(listeningSecondsLeft);
  }

  function stopListeningTimer() {
    if (listeningTimerId) {
      clearInterval(listeningTimerId);
      listeningTimerId = null;
    }
  }

  function updateReadingTimerDisplay() {
    var timerEl = document.getElementById('step3Timer');
    if (timerEl) timerEl.textContent = 'Time left: ' + formatSecondsMMSS(readingSecondsLeft);
  }

  function updateWritingTimerDisplay() {
    var timerEl = document.getElementById('step4Timer');
    if (timerEl) timerEl.textContent = 'Time left: ' + formatSecondsMMSS(writingSecondsLeft);
  }

  function stopReadingTimer() {
    if (readingTimerId) {
      clearInterval(readingTimerId);
      readingTimerId = null;
    }
  }

  function stopWritingTimer() {
    if (writingTimerId) {
      clearInterval(writingTimerId);
      writingTimerId = null;
    }
  }

  function stopSectionTimers() {
    stopListeningTimer();
    stopReadingTimer();
    stopWritingTimer();
  }

  function startListeningTimerIfNeeded() {
    if (listeningTimerId || currentStep !== 2) return;
    var durText = (ptConfig && ptConfig.step2 && ptConfig.step2.duration) || '';
    listeningSecondsLeft = parseDurationToSeconds(durText, 15 * 60);
    updateListeningTimerDisplay();
    listeningTimerId = setInterval(function() {
      listeningSecondsLeft--;
      updateListeningTimerDisplay();
      if (listeningSecondsLeft <= 0) {
        stopListeningTimer();
        showStep(3);
      }
    }, 1000);
  }

  function startReadingTimerIfNeeded() {
    if (readingTimerId || currentStep !== 4) return;
    var durText = (ptConfig && ptConfig.step3 && ptConfig.step3.duration) || '';
    readingSecondsLeft = parseDurationToSeconds(durText, 25 * 60);
    updateReadingTimerDisplay();
    readingTimerId = setInterval(function() {
      readingSecondsLeft--;
      updateReadingTimerDisplay();
      if (readingSecondsLeft <= 0) {
        stopReadingTimer();
        showStep(5);
      }
    }, 1000);
  }

  function startWritingTimerIfNeeded() {
    if (writingTimerId || currentStep !== 5) return;
    writingSecondsLeft = getWritingTotalSeconds(ptConfig, writingPrompts);
    updateWritingTimerDisplay();
    writingTimerId = setInterval(function() {
      writingSecondsLeft--;
      updateWritingTimerDisplay();
      if (writingSecondsLeft <= 0) {
        stopWritingTimer();
        doSubmit();
      }
    }, 1000);
  }

  function renderResultStatus(payload) {
    if (!payload) return;
    var total = Math.min(100, Math.max(0, parseInt(payload.total_score, 10) || 0));
    var status = total >= PASSING_SCORE ? 'PASS' : 'FAIL';
    payload.result_status = status;
    var msgEl = document.getElementById('ptStep6Message');
    if (msgEl) {
      msgEl.textContent = 'Total Score: ' + total + '/100 | Level: ' + (payload.suggested_level || '-') + ' | Status: ' + status + ' (Passing Score: ' + PASSING_SCORE + ')';
    }
  }

  function checkRetakeEligibility(payload) {
    if (!window.SchoolAPI || !SchoolAPI.getPlacementAttemptStatus) return Promise.resolve({ ok: true, can_take_test: true });
    return SchoolAPI.getPlacementAttemptStatus({
      name: payload && payload.name ? payload.name : '',
      email: payload && payload.email ? payload.email : '',
      phone: payload && payload.phone ? payload.phone : '',
      date_of_birth: payload && payload.date_of_birth ? payload.date_of_birth : '',
      parent_name: payload && payload.parent_name ? payload.parent_name : ''
    }).catch(function() {
      return { ok: true, can_take_test: true };
    });
  }

  function recordAttemptOnSubmit(payload) {
    if (!window.SchoolAPI || !SchoolAPI.recordPlacementAttempt) return Promise.resolve(false);
    return SchoolAPI.recordPlacementAttempt({
      name: payload && payload.name ? payload.name : '',
      email: payload && payload.email ? payload.email : '',
      phone: payload && payload.phone ? payload.phone : '',
      date_of_birth: payload && payload.date_of_birth ? payload.date_of_birth : '',
      parent_name: payload && payload.parent_name ? payload.parent_name : '',
      client_submission_id: payload && payload.client_submission_id ? payload.client_submission_id : '',
      total_score: payload && payload.total_score != null ? payload.total_score : 0,
      suggested_level: payload && payload.suggested_level ? payload.suggested_level : '',
      result_status: payload && payload.result_status ? payload.result_status : '',
      isPassed: payload && payload.result_status ? (payload.result_status === 'PASS') : false
    }).then(function(res) {
      return !!(res && res.ok);
    }).catch(function() {
      return false;
    });
  }

  function mapLevelToCefr(level, totalScore) {
    var score = Math.min(100, Math.max(0, parseInt(totalScore, 10) || 0));
    if (score <= 20) return 'Pre-A1';
    if (score <= 40) return 'A1';
    if (score <= 65) return 'A2';
    if (score <= 85) return 'B1';
    return 'B2';
  }

  function formatIsoToDisplayDate(isoText) {
    var d = new Date(isoText || '');
    if (isNaN(d.getTime())) return String(isoText || '').slice(0, 10);
    var yyyy = d.getFullYear();
    var mm = (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
    var dd = (d.getDate() < 10 ? '0' : '') + d.getDate();
    return yyyy + '-' + mm + '-' + dd;
  }

  function getCertificatePayloadFromStorage() {
    try {
      var s = localStorage.getItem('placement_test_submission');
      if (!s) return null;
      var parsed = JSON.parse(s);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function getActiveCertificatePayload() {
    return latestResultPayload || getCertificatePayloadFromStorage();
  }

  function updateCertificateButtonVisibility(payload) {
    var btn = document.getElementById('ptDownloadCertificateBtn');
    if (!btn) return;
    btn.style.display = payload ? '' : 'none';
  }

  function downloadCertificatePdf(payload) {
    if (!payload) { alert('Result not found yet.'); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library not available.');
      return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var name = String(payload.name || payload.student_name || 'Student');
    var total = Math.min(100, Math.max(0, parseInt(payload.total_score, 10) || 0));
    var level = String(payload.suggested_level || '');
    var cefr = mapLevelToCefr(level, total);
    var passFail = String(payload.result_status || (total >= PASSING_SCORE ? 'PASS' : 'FAIL'));
    var dateText = formatIsoToDisplayDate(payload.submittedAt || payload.test_date || new Date().toISOString());
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 12;
    var certToken = String(payload.client_submission_id || payload._id || '').trim();
    var verificationUrl = certToken
      ? (window.location.origin + '/public-page/placement-test.html?certificate=' + encodeURIComponent(certToken))
      : '';

    // Frame
    doc.setDrawColor(33, 86, 166);
    doc.setLineWidth(1.6);
    doc.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);
    doc.setLineWidth(0.6);
    doc.rect(margin + 3, margin + 3, pageW - (margin + 3) * 2, pageH - (margin + 3) * 2);

    // Optional logo if available in page
    try {
      var logoEl = document.querySelector('img[data-upload-id="logo"]');
      if (logoEl && logoEl.src) {
        doc.addImage(logoEl.src, 'PNG', margin + 8, margin + 8, 24, 24);
      }
    } catch (e) {}

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 60, 130);
    doc.setFontSize(15);
    doc.text('Myanmar New Era Education Centre', pageW / 2, margin + 14, { align: 'center' });
    doc.setFontSize(30);
    doc.text('Certificate of Achievement', pageW / 2, margin + 30, { align: 'center' });
    doc.setFontSize(13);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 55, 55);
    doc.text('Placement Test Certificate', pageW / 2, margin + 38, { align: 'center' });

    doc.setFontSize(12);
    doc.text('This certifies that', pageW / 2, margin + 52, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(25, 25, 25);
    doc.text(name, pageW / 2, margin + 67, { align: 'center' });
    doc.setFont('helvetica', 'normal');

    // Details panel
    var panelX = margin + 24;
    var panelY = margin + 78;
    var panelW = pageW - (margin + 24) * 2;
    var panelH = 58;
    doc.setDrawColor(180, 198, 224);
    doc.setFillColor(246, 250, 255);
    doc.roundedRect(panelX, panelY, panelW, panelH, 3, 3, 'FD');

    doc.setFontSize(12);
    doc.setTextColor(35, 35, 35);
    var leftX = panelX + 8;
    var rightX = panelX + panelW / 2 + 4;
    var row1 = panelY + 13;
    var row2 = panelY + 25;
    var row3 = panelY + 37;
    var row4 = panelY + 49;
    doc.text('Test Date: ' + dateText, leftX, row1);
    doc.text('Total Score: ' + total + ' / 100', leftX, row2);
    doc.text('School Level: ' + (level || '-'), leftX, row3);
    doc.text('CEFR Level: ' + (cefr || '-'), leftX, row4);
    doc.text('Result Status: ' + passFail, rightX, row1);
    doc.text('Passing Score: ' + PASSING_SCORE + ' / 100', rightX, row2);
    doc.text('Certificate ID: ' + (certToken || '-'), rightX, row3);

    // Verification link (optional)
    doc.setFontSize(10);
    doc.setTextColor(70, 70, 70);
    if (verificationUrl) doc.text('Verification Link: ' + verificationUrl, panelX + 8, panelY + panelH + 11);
    else doc.text('Verification Link: (not available for this record)', panelX + 8, panelY + panelH + 11);

    // Footer
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text('Myanmar New Era Education Centre', pageW / 2, pageH - 18, { align: 'center' });
    doc.text('Generated on: ' + formatIsoToDisplayDate(new Date().toISOString()), pageW / 2, pageH - 12, { align: 'center' });
    var filename = (String(name).replace(/[^a-zA-Z0-9_\-]+/g, '_') || 'student') + '_placement_certificate.pdf';
    doc.save(filename);
  }

  function loadResultFromCertificateToken() {
    if (!window.location || !window.location.search) return Promise.resolve(null);
    var q = new URLSearchParams(window.location.search);
    var token = q.get('certificate');
    if (!token) return Promise.resolve(null);
    if (!window.SchoolAPI || !SchoolAPI.getWebExtra) return Promise.resolve(null);
    return SchoolAPI.getWebExtra('placement_test_results').then(function(r) {
      var list = (r && r.ok && Array.isArray(r.data)) ? r.data : [];
      var found = null;
      for (var i = 0; i < list.length; i++) {
        var it = list[i] || {};
        if (String(it.client_submission_id || '') === token || String(it._id || '') === token) {
          found = it;
          break;
        }
      }
      if (!found) return null;
      latestResultPayload = found;
      renderResultStatus(found);
      updateCertificateButtonVisibility(found);
      showStep(6);
      return found;
    }).catch(function() {
      return null;
    });
  }

  function applyConfig(c) {
    ptConfig = c;
    if (!c) return;
    setText('ptPageTitle', c.pageTitle);
    setText('ptPageCrumb', c.pageTitle);
    setText('stepperLabel', c.stepperLabel);
    if (c.step1) {
      var t1 = document.getElementById('ptStep1Title');
      var s1 = document.getElementById('ptStep1Subtitle');
      var btn = document.getElementById('nextTo2');
      if (t1 && c.step1.title) t1.setAttribute('data-lang-my', c.step1.title);
      if (s1 && c.step1.subtitle) s1.setAttribute('data-lang-my', c.step1.subtitle);
      if (btn && c.step1.btnNext) btn.setAttribute('data-lang-my', c.step1.btnNext);
    }
    if (c.step2) {
      setText('ptStep2Title', c.step2.title);
      setText('ptStep2Instruction', c.step2.instruction || '');
      var introDesc = document.getElementById('ptStep2IntroDesc');
      if (introDesc) {
        if (c.step2.introDesc) introDesc.textContent = c.step2.introDesc;
        else if (c.step2.instruction) introDesc.textContent = c.step2.instruction;
      }
      var durEl = document.getElementById('ptStep2Duration');
      if (durEl) durEl.textContent = parseDurationToMinutes(c.step2.duration, 15) + ' mins';
      listenLimit = Math.max(1, Math.min(3, parseInt(c.step2.listenLimit, 10) || 2));
      var audio = document.getElementById('listeningAudio');
      if (audio && c.step2.audioUrl) audio.src = c.step2.audioUrl;
      var qDiv = document.getElementById('step2Questions');
      if (qDiv && c.step2.questions && c.step2.questions.length) {
        listeningQuestionIndex = 0;
        listeningAnswers = new Array(c.step2.questions.length).fill('');
        renderListeningQuestion(0);
      }
    }
    if (c.step3) {
      setText('ptStep3Title', c.step3.title);
      setText('ptStep3Instruction', c.step3.instruction);
      if (document.getElementById('step3Timer')) {
        var step3Seconds = parseDurationToSeconds(c.step3.duration, 25 * 60);
        setText('step3Timer', 'Time left: ' + formatSecondsMMSS(step3Seconds));
      }
    }
    if (c.step4) {
      setText('ptStep4Title', c.step4.title);
      var introDesc = document.getElementById('ptStep4IntroDesc');
      if (introDesc && c.step4.introDesc) introDesc.textContent = c.step4.introDesc;
      if (c.step4.prompts && c.step4.prompts.length) {
        writingPrompts = c.step4.prompts.map(function(p) {
          if (typeof p === 'string') return { text: p, targetWords: 20, durationMinutes: getWritingPerPromptMinutes(c) };
          return {
            text: p.text || p.prompt || '',
            targetWords: p.targetWords || p.target || 20,
            durationMinutes: Math.max(1, parseInt(p.durationMinutes, 10) || getWritingPerPromptMinutes(c))
          };
        });
      } else {
        writingPrompts = [];
      }
      var totalWritingMinutes = Math.max(1, Math.round(getWritingTotalSeconds(c, writingPrompts) / 60));
      var durEl = document.getElementById('ptStep4Duration');
      if (durEl) durEl.textContent = totalWritingMinutes + ' mins';
      if (document.getElementById('step4Timer')) {
        setText('step4Timer', 'Time left: ' + formatSecondsMMSS(totalWritingMinutes * 60));
      }
    }
    if (c.step5) {
      setText('ptStep5Title', c.step5.title);
      speakingEnabled = c.step5.enabled !== false;
      speakingRecordSeconds = getSpeakingRecordSeconds(c);
      speakingInstructionText = String(c.step5.instruction || c.step5.taskInstruction || '').trim();
      var introDesc5 = document.getElementById('ptStep5IntroDesc');
      if (introDesc5) {
        if (c.step5.introDesc) introDesc5.textContent = c.step5.introDesc;
        else if (speakingInstructionText) introDesc5.textContent = speakingInstructionText;
      }
      var dur5 = document.getElementById('ptStep5Duration');
      if (dur5) dur5.textContent = 'Recording: ' + speakingRecordSeconds + ' secs';
      var timeVal = document.getElementById('step5TimeValue');
      if (timeVal) timeVal.textContent = '00:' + (speakingRecordSeconds < 10 ? '0' : '') + speakingRecordSeconds;
      var questionTextEl = document.getElementById('step5QuestionText');
      if (questionTextEl && speakingInstructionText) questionTextEl.textContent = speakingInstructionText;
    }
    if (c.step6) {
      setText('ptStep6Title', c.step6.title);
      setText('ptStep6Message', c.step6.message);
      setText('ptStep6ThankYou', c.step6.thankYou);
      var backBtn = document.getElementById('ptStep6ButtonBack');
      if (backBtn && c.step6.buttonBack) backBtn.textContent = c.step6.buttonBack;
    }
    setText('ptPageTitle', 'Free Placement Test');
    setText('ptPageCrumb', 'Free Placement Test');
    applyStep1Lang();
  }

  function applyStep1Lang() {
    var lang = (document.body && document.body.getAttribute('data-lang')) || 'en';
    var key = lang === 'my' ? 'data-lang-my' : 'data-lang-en';
    ['ptStep1Title', 'ptStep1Subtitle', 'nextTo2'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        var val = el.getAttribute(key);
        if (val) el.textContent = val;
      }
    });
    document.querySelectorAll('select#pEducation option[data-lang-en]').forEach(function(opt) {
      var val = opt.getAttribute(key);
      if (val) opt.textContent = val;
    });
  }

  function escHtml(v) {
    return String(v || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getListeningItems() {
    return (ptConfig && ptConfig.step2 && Array.isArray(ptConfig.step2.questions)) ? ptConfig.step2.questions : [];
  }

  function updateExamProgressUI() {
    var total = getListeningItems().length;
    var answered = listeningAnswers.filter(function(v) { return !!v; }).length;
    var progressLabel = document.getElementById('ptExamProgressLabel');
    var progressBar = document.getElementById('ptExamProgressBar');
    if (progressLabel) {
      var pa = progressLabel.querySelector('.pt-progress-answered');
      var pt = progressLabel.querySelector('.pt-progress-total');
      if (pa && pt) {
        pa.textContent = String(answered);
        pt.textContent = String(total);
      } else {
        progressLabel.textContent = answered + '/' + total;
      }
    }
    if (progressBar) progressBar.style.width = (total > 0 ? ((answered / total) * 100) : 0).toFixed(1) + '%';
  }

  function renderListeningNavigator() {
    var nav = document.getElementById('step2Navigator');
    var items = getListeningItems();
    if (!nav) return;
    nav.innerHTML = items.map(function(_, idx) {
      var isCurrent = idx === listeningQuestionIndex;
      var isAnswered = !!listeningAnswers[idx];
      var cls = 'pt-nav-btn' + (isCurrent ? ' current' : '') + (isAnswered ? ' answered' : '');
      var mark = isCurrent ? '◉' : (isAnswered ? '●' : '○');
      return '<button type="button" class="' + cls + '" data-step2-nav="' + idx + '">' + (idx + 1) + ' ' + mark + '</button>';
    }).join('');
  }

  function renderListeningQuestion(index) {
    var items = getListeningItems();
    var total = items.length;
    var qEl = document.getElementById('step2Questions');
    var counterEl = document.getElementById('step2QuestionCounter');
    var prevBtn = document.getElementById('step2PrevBtn');
    var nextBtn = document.getElementById('step2NextBtn');
    if (!qEl || !total) return;
    if (index < 0) index = 0;
    if (index >= total) index = total - 1;
    listeningQuestionIndex = index;
    var item = items[index] || {};
    var qText = escHtml(item.question || ('Question ' + (index + 1)));
    var selected = listeningAnswers[index] || '';
    var opts = (item.options || []).map(function(o) {
      var key = String(o.key || '');
      var checked = selected === key ? ' checked' : '';
      return (
        '<label class="pt-option-box" data-opt-key="' + escHtml(key) + '">' +
          '<input type="radio" name="listening_current" value="' + key + '"' + checked + '>' +
          '<span class="pt-opt-pill" aria-hidden="true">' + escHtml(key) + '</span>' +
          '<span class="opt-text">' + escHtml(o.text || '') + '</span>' +
        '</label>'
      );
    }).join('');
    qEl.innerHTML = '<div class="pt-question-block"><p class="pt-question-text">' + qText + '</p><div class="pt-options">' + opts + '</div></div>';
    if (counterEl) counterEl.textContent = 'Question ' + (index + 1) + ' of ' + total;
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index >= total - 1;
    renderListeningNavigator();
    updateExamProgressUI();
  }

  function getOverallAnsweredCount() {
    var listeningCount = listeningAnswers.filter(function(v) { return !!v; }).length;
    var readingCount = readingAnswers.filter(function(v) { return !!v; }).length;
    return listeningCount + readingCount;
  }

  function getOverallQuestionCount() {
    var listeningTotal = getListeningItems().length;
    var readingTotal = (ptConfig && ptConfig.step3 && Array.isArray(ptConfig.step3.items)) ? ptConfig.step3.items.length : 0;
    return listeningTotal + readingTotal;
  }

  function renderReadingQuestion(index) {
    var items = (ptConfig && ptConfig.step3 && ptConfig.step3.items) ? ptConfig.step3.items : [];
    var total = items.length;
    var progEl = document.getElementById('step3Progress');
    var qEl = document.getElementById('step3Question');
    var nextBtn = document.getElementById('nextTo4');
    if (progEl) progEl.textContent = total ? 'Question ' + (index + 1) + ' of ' + total : '';
    if (nextBtn) { nextBtn.textContent = 'Next'; nextBtn.classList.add('btn-pt-next'); nextBtn.style.display = ''; }
    if (!qEl || index < 0 || index >= total) return;
    var item = items[index];
    var sentence = (item.sentence || item.question || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    var opts = (item.options || []).map(function(o) {
      var key = String(o.key || '');
      var t = (o.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return (
        '<label class="pt-option-box" data-opt-key="' + key.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '">' +
          '<input type="radio" name="reading_current" value="' + key.replace(/\"/g, '&quot;') + '">' +
          '<span class="pt-opt-pill" aria-hidden="true">' + key.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
          '<span class="opt-text">' + t + '</span>' +
        '</label>'
      );
    }).join('');
    qEl.innerHTML = '<p class="pt-question-text">' + sentence + '</p><div class="pt-options">' + opts + '</div>';
  }

  function showStep(n) {
    currentStep = n;
    if (n !== 2) {
      stopListeningTimer();
      var step2Audio = document.getElementById('listeningAudio');
      if (step2Audio) {
        try {
          step2Audio.pause();
          step2Audio.currentTime = 0;
        } catch (e) {}
      }
    }
    if (n !== 4) stopReadingTimer();
    if (n !== 5) stopWritingTimer();
    var row = document.querySelector('.placement-step1-row');
    var main = document.querySelector('.placement-main');
    if (row) row.style.display = n === 1 ? '' : 'none';
    if (main) main.style.display = n === 1 ? 'none' : '';
    document.querySelectorAll('.placement-step').forEach(function(el) { el.classList.remove('active'); });
    var logicalToSection = { 1: 'step1', 2: 'step2', 3: 'step5', 4: 'step3', 5: 'step4', 6: 'step6' };
    var stepEl = document.getElementById(logicalToSection[n] || ('step' + n));
    if (stepEl) stepEl.classList.add('active');
    document.querySelectorAll('.stepper-bar .step').forEach(function(el) {
      el.classList.toggle('active', parseInt(el.dataset.step, 10) === n);
    });
    var labels = ['Student Info', 'Listening', 'Speaking', 'Reading', 'Writing', 'Result'];
    var lab = document.getElementById('stepperLabel');
    if (lab) lab.textContent = 'Step ' + n + ': ' + (labels[n - 1] || '');
    if (n === 2) {
      var intro = document.getElementById('step2Intro');
      var wrap = document.getElementById('step2QuestionsWrap');
      if (intro) intro.style.display = '';
      if (wrap) wrap.style.display = 'none';
      var listeningDurationEl = document.getElementById('ptStep2Duration');
      if (listeningDurationEl) {
        var listeningMinutes = parseDurationToMinutes((ptConfig && ptConfig.step2 && ptConfig.step2.duration) || '', 15);
        listeningDurationEl.textContent = listeningMinutes + ' mins';
      }
      if (getListeningItems().length) renderListeningQuestion(listeningQuestionIndex || 0);
    }
    if (n === 3) {
      if (!speakingEnabled) {
        showStep(4);
        return;
      }
      var i5 = document.getElementById('step5Intro');
      var m5 = document.getElementById('step5MicCard');
      var p5 = document.getElementById('step5Part1Intro');
      var t5 = document.getElementById('step5TaskWrap');
      if (i5) i5.style.display = '';
      if (m5) m5.style.display = 'none';
      if (p5) p5.style.display = 'none';
      if (t5) t5.style.display = 'none';
      speakingPhase = '';
    }
    if (n === 4) {
      readingQuestionIndex = 0;
      readingAnswers = [];
      renderReadingQuestion(0);
      startReadingTimerIfNeeded();
    }
    if (n === 5) {
      var intro4 = document.getElementById('step4Intro');
      var wrap4 = document.getElementById('step4TasksWrap');
      if (intro4) intro4.style.display = '';
      if (wrap4) wrap4.style.display = 'none';
      writingPromptIndex = 0;
      writingAnswers = [];
      writingSecondsLeft = getWritingTotalSeconds(ptConfig, writingPrompts);
      updateWritingTimerDisplay();
    }
  }

  function doSubmit() {
    if (isSubmitting) return;
    isSubmitting = true;
    stopSectionTimers();
    var payload = collectPayload();
    payload = computeScores(payload);
    renderResultStatus(payload);
    latestResultPayload = payload;
    updateCertificateButtonVisibility(payload);
    showStep(6);
    recordAttemptOnSubmit(payload);
    uploadRecordedBlobToServer(payload).then(function() {
      persistPlacementSubmission(payload);
    }).catch(function() {
      persistPlacementSubmission(payload);
    });
  }

  function renderWritingPrompt(index) {
    var prompts = writingPrompts;
    var total = prompts.length;
    var progEl = document.getElementById('step4Progress');
    var promptEl = document.getElementById('step4PromptText');
    var targetEl = document.getElementById('step4TargetWords');
    var textarea = document.getElementById('writingText');
    var nextBtn = document.getElementById('nextTo5');
    if (progEl) progEl.textContent = total ? 'Prompt ' + (index + 1) + ' of ' + total : '';
    if (nextBtn) { nextBtn.textContent = index < total - 1 ? 'Next' : 'Next'; nextBtn.style.display = ''; }
    if (!promptEl || !textarea || index < 0 || index >= total) return;
    var item = prompts[index];
    promptEl.textContent = item.text || '';
    if (targetEl) {
      var promptMinutes = Math.max(1, parseInt(item.durationMinutes, 10) || getWritingPerPromptMinutes(ptConfig));
      targetEl.textContent = 'Target: ' + (item.targetWords || 20) + ' words | Recommended time: ' + promptMinutes + ' min';
    }
    textarea.value = writingAnswers[index] != null ? writingAnswers[index] : '';
  }

  function collectPayload() {
    var listening = [];
    var reading = [];
    var i = 0;
    var listeningTotal = (ptConfig && ptConfig.step2 && Array.isArray(ptConfig.step2.questions)) ? ptConfig.step2.questions.length : 0;
    if (listeningAnswers.length > 0) {
      for (i = 0; i < listeningTotal; i++) listening.push(listeningAnswers[i] || '');
    } else {
      for (i = 0; i < listeningTotal; i++) listening.push('');
    }
    if (readingAnswers.length > 0) {
      var readingTotalFromConfig = (ptConfig && ptConfig.step3 && Array.isArray(ptConfig.step3.items)) ? ptConfig.step3.items.length : readingAnswers.length;
      for (i = 0; i < readingTotalFromConfig; i++) {
        reading.push(readingAnswers[i] || '');
      }
    } else {
      var readingTotal = (ptConfig && ptConfig.step3 && Array.isArray(ptConfig.step3.items)) ? ptConfig.step3.items.length : 0;
      for (i = 0; i < readingTotal; i++) {
        var rr = document.querySelector('input[name="reading_' + i + '"]:checked');
        reading.push(rr ? rr.value : '');
      }
    }
    var writingEl = document.getElementById('writingText');
    if (writingEl && writingPrompts.length && writingPromptIndex >= 0 && writingPromptIndex < writingPrompts.length) {
      writingAnswers[writingPromptIndex] = writingEl.value || '';
    }
    var writing = '';
    if (writingAnswers.length > 0 || writingPrompts.length > 0) {
      var writingTotal = writingPrompts.length || writingAnswers.length;
      var chunks = [];
      for (i = 0; i < writingTotal; i++) {
        var promptText = writingPrompts[i] && writingPrompts[i].text ? writingPrompts[i].text : ('Prompt ' + (i + 1));
        var essayText = writingAnswers[i] || '';
        chunks.push('Prompt ' + (i + 1) + ': ' + promptText + '\n' + essayText);
      }
      writing = chunks.join('\n\n');
    } else {
      writing = writingEl ? (writingEl.value || '') : '';
    }
    var wordCount = (writing.match(/\S+/g) || []).length;
    var payload = {
      name: document.getElementById('pName') && document.getElementById('pName').value,
      phone: document.getElementById('pPhone') && normalizePhoneInput(document.getElementById('pPhone').value),
      email: document.getElementById('pEmail') && document.getElementById('pEmail').value,
      date_of_birth: getDobValue(),
      education: document.getElementById('pEducation') && document.getElementById('pEducation').value,
      parent_name: document.getElementById('pParentName') && document.getElementById('pParentName').value,
      listening: listening,
      reading: reading,
      writing: writing,
      writing_essay: writing,
      wordCount: wordCount,
      hasSpeaking: !!recordedBlob,
      submittedAt: new Date().toISOString(),
      client_submission_id: makeClientSubmissionId(),
      listening_question_ids: activeListeningQuestionIds.slice(),
      reading_question_ids: activeReadingQuestionIds.slice()
    };
    payload.listening_answer_map = listening.map(function(selectedKey, idx) {
      return { question_id: payload.listening_question_ids[idx] || '', selected_option: selectedKey };
    });
    payload.reading_answer_map = reading.map(function(selectedKey, idx) {
      return { question_id: payload.reading_question_ids[idx] || '', selected_option: selectedKey };
    });
    if (storedApplication && storedApplication.application_id) payload.application_id = storedApplication.application_id;
    var user = window.AcademyAuth && AcademyAuth.currentUser();
    if (user) payload.userId = user.uid;
    return payload;
  }

  function makeClientSubmissionId() {
    var rand = Math.random().toString(36).slice(2, 8);
    return 'pt_' + Date.now() + '_' + rand;
  }

  function buildPlacementResultRecord(payload) {
    var record = {
      client_submission_id: payload.client_submission_id,
      name: payload.name,
      student_name: payload.name,
      phone: payload.phone,
      email: payload.email,
      date_of_birth: payload.date_of_birth || '',
      education: payload.education || '',
      parent_name: payload.parent_name || '',
      grammar_score: payload.grammar_score,
      vocabulary_score: payload.vocabulary_score,
      listening_score: payload.listening_score,
      reading_score: payload.reading_score,
      writing_score: payload.writing_score,
      speaking_score: payload.speaking_score,
      total_score: payload.total_score,
      suggested_level: payload.suggested_level,
      result_status: payload.result_status || '',
      passing_score: PASSING_SCORE,
      submittedAt: payload.submittedAt,
      listening_answers: payload.listening,
      reading_answers: payload.reading,
      writing_essay: payload.writing_essay != null ? payload.writing_essay : payload.writing,
      listening_correct_answers: payload.listening_correct_answers || [],
      reading_correct_answers: payload.reading_correct_answers || [],
      listening_question_ids: payload.listening_question_ids || [],
      reading_question_ids: payload.reading_question_ids || [],
      listening_answer_map: payload.listening_answer_map || [],
      reading_answer_map: payload.reading_answer_map || [],
      speaking_audio_id: payload.speaking_audio_id || '',
      speaking_audio_file: payload.speaking_audio_file || '',
      speaking_audio_url: payload.speaking_audio_url || '',
      writing: payload.writing,
      hasSpeaking: payload.hasSpeaking,
      listening: payload.listening,
      reading: payload.reading
    };
    if (payload.application_id) record.application_id = payload.application_id;
    if (payload.userId) record.userId = payload.userId;
    return record;
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

  function mergePlacementPair(prev, record) {
    var tp = placementRecordTimeMs(prev);
    var tr = placementRecordTimeMs(record);
    var older = tr >= tp ? prev : record;
    var newer = tr >= tp ? record : prev;
    var merged = Object.assign({}, older, newer);
    if ((merged.writing == null || merged.writing === '') && (prev.writing || record.writing)) {
      merged.writing = (newer.writing != null && newer.writing !== '') ? newer.writing : (older.writing || merged.writing || '');
    }
    if (merged.hasSpeaking == null && (prev.hasSpeaking != null || record.hasSpeaking != null)) {
      merged.hasSpeaking = newer.hasSpeaking != null ? newer.hasSpeaking : older.hasSpeaking;
    }
    if (!merged.test1_snapshot && (prev.test1_snapshot || record.test1_snapshot)) merged.test1_snapshot = prev.test1_snapshot || record.test1_snapshot;
    if ((!merged.test_form || merged.test_form === '') && (prev.test_form || record.test_form)) merged.test_form = prev.test_form || record.test_form;
    return merged;
  }

  function dedupePlacementList(list) {
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
        byKey[key] = mergePlacementPair(byKey[key], it);
      }
    });
    return order.map(function(k) { return byKey[k]; });
  }

  function mergePlacementRecord(list, record) {
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      var it = list[i] || {};
      if (it.client_submission_id && record.client_submission_id && it.client_submission_id === record.client_submission_id) {
        idx = i; break;
      }
      if (!it.client_submission_id && !record.client_submission_id) {
        var sameName = String(it.name || it.student_name || '') === String(record.name || record.student_name || '');
        var samePhone = String(it.phone || '') === String(record.phone || '');
        var sameTime = String(it.submittedAt || '') === String(record.submittedAt || '');
        if (sameName && samePhone && sameTime) { idx = i; break; }
      }
    }
    if (idx >= 0) list[idx] = mergePlacementPair(list[idx], record);
    else list.push(record);
    return dedupePlacementList(list);
  }

  function blobToBase64Data(blob) {
    return new Promise(function(resolve, reject) {
      if (!blob) { resolve(''); return; }
      var reader = new FileReader();
      reader.onloadend = function() {
        var result = typeof reader.result === 'string' ? reader.result : '';
        var commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = function() { reject(new Error('Failed to read recorded audio blob')); };
      reader.readAsDataURL(blob);
    });
  }

  function uploadRecordedBlobToServer(payload) {
    if (!recordedBlob) return Promise.resolve(false);
    if (!window.SchoolAPI || !SchoolAPI.getWebExtra || !SchoolAPI.saveWebExtra) return Promise.resolve(false);
    var now = new Date().toISOString();
    var audioId = 'ptaud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var fileName = (payload && payload.client_submission_id ? payload.client_submission_id : 'placement_test') + '_speaking.webm';
    return blobToBase64Data(recordedBlob).then(function(base64Data) {
      var audioRecord = {
        id: audioId,
        client_submission_id: payload && payload.client_submission_id ? payload.client_submission_id : '',
        name: payload && payload.name ? payload.name : '',
        phone: payload && payload.phone ? payload.phone : '',
        mime_type: recordedBlob.type || 'audio/webm',
        file_name: fileName,
        file_size: recordedBlob.size || 0,
        file_data: base64Data,
        audio_url: 'data:' + (recordedBlob.type || 'audio/webm') + ';base64,' + base64Data,
        uploaded_at: now
      };
      return SchoolAPI.getWebExtra('placement_test_audio').then(function(r) {
        var list = (r && r.ok && Array.isArray(r.data)) ? r.data.slice() : [];
        list.push(audioRecord);
        return SchoolAPI.saveWebExtra('placement_test_audio', list).then(function(saved) {
          var ok = !!(saved && saved.ok);
          if (ok && payload) {
            payload.speaking_audio_id = audioId;
            payload.speaking_audio_file = fileName;
            payload.speaking_audio_url = audioRecord.audio_url;
          }
          return ok;
        });
      });
    }).catch(function(err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[PlacementTest] Failed to upload speaking recording.', err && (err.error || err.message || err));
      }
      return false;
    });
  }

  function persistPlacementSubmission(payload) {
    try { localStorage.setItem('placement_test_submission', JSON.stringify(payload)); } catch (e) {}
    var apiSavePromise = savePlacementResultToApi(payload);
    var firebaseSavePromise = savePlacementResultToFirebase(payload);
    if (apiSavePromise && typeof apiSavePromise.then === 'function') {
      apiSavePromise.then(function(ok) {
        if (ok) return;
        var msg = document.getElementById('ptStep6Message');
        if (msg) {
          msg.textContent = (msg.textContent ? (msg.textContent + ' ') : '') + '  Admin   server run   URL  ( http://localhost:3000 / http://localhost:5001).';
        }
      }).catch(function() {});
    }
    if (firebaseSavePromise && typeof firebaseSavePromise.then === 'function') {
      firebaseSavePromise.then(function(ok) {
        if (ok) return;
        var msg = document.getElementById('ptStep6Message');
        if (msg) {
          msg.textContent = (msg.textContent ? (msg.textContent + ' ') : '') + 'Firebase save  API  Admin page  server/domain ';
        }
      }).catch(function() {});
    }
  }

  function savePlacementResultToApi(payload) {
    if (!window.SchoolAPI || !SchoolAPI.getWebExtra || !SchoolAPI.saveWebExtra) return Promise.resolve(false);
    var record = buildPlacementResultRecord(payload);
    return SchoolAPI.getWebExtra('placement_test_results').then(function(r) {
      var list = (r && r.ok && Array.isArray(r.data)) ? r.data.slice() : [];
      list = mergePlacementRecord(list, record);
      return SchoolAPI.saveWebExtra('placement_test_results', list).then(function(saved) {
        return !!(saved && saved.ok);
      });
    }).catch(function(err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[PlacementTest] Failed to save placement_test_results via API.', err && (err.error || err.message || err));
      }
      return false;
    });
  }

  function savePlacementResultToFirebase(payload) {
    if (window.AcademyFirebase && AcademyFirebase.saveSubmission) {
      return new Promise(function(resolve) {
        AcademyFirebase.saveSubmission(payload, function(id) { resolve(!!id); });
      });
    }
    if (typeof firebase === 'undefined' || !firebase.database) return Promise.resolve(false);
    try {
      var cfg = window.FIREBASE_CONFIG;
      if (cfg && cfg.apiKey && cfg.projectId && (!firebase.apps || !firebase.apps.length)) {
        firebase.initializeApp(cfg);
      }
      var record = buildPlacementResultRecord(payload);
      record.status = 'new';
      return firebase.database().ref('submissions').push(record).then(function() { return true; }).catch(function() { return false; });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /** Scoring: Listening 25, Speaking 25, Reading 25, Writing 25. Total 100. */
  function computeScores(payload) {
    if (!ptConfig) return payload;
    var listeningCorrect = (ptConfig.step2 && ptConfig.step2.questions) ? ptConfig.step2.questions.map(function(q) { return q.correct || ''; }) : [];
    var readingCorrect = (ptConfig.step3 && ptConfig.step3.items) ? ptConfig.step3.items.map(function(q) { return q.correct || ''; }) : [];
    var listeningRaw = (payload.listening || []).filter(function(a, i) { return a === listeningCorrect[i]; }).length;
    var readingRaw = (payload.reading || []).filter(function(a, i) { return a === readingCorrect[i]; }).length;
    var totalL = Math.max(1, listeningCorrect.length);
    var totalR = Math.max(1, readingCorrect.length);
    var reading_score = Math.min(25, Math.round((readingRaw / totalR) * 25));
    var listening_score = Math.min(25, Math.round((listeningRaw / totalL) * 25));
    var writing_score = parseInt(payload.writing_score, 10);
    if (isNaN(writing_score)) writing_score = 0;
    var speaking_score = parseInt(payload.speaking_score, 10);
    if (isNaN(speaking_score)) speaking_score = 0;
    payload.grammar_score = 0;
    payload.vocabulary_score = 0;
    payload.reading_score = reading_score;
    payload.listening_score = listening_score;
    payload.listening_correct_answers = listeningCorrect.slice();
    payload.reading_correct_answers = readingCorrect.slice();
    payload.writing_score = Math.min(25, Math.max(0, writing_score));
    payload.speaking_score = Math.min(25, Math.max(0, speaking_score));
    payload.total_score = Math.min(100, payload.reading_score + payload.listening_score + payload.writing_score + payload.speaking_score);
    payload.suggested_level = scoreToLevel(payload.total_score);
    payload.result_status = payload.total_score >= PASSING_SCORE ? 'PASS' : 'FAIL';
    function scoreToLevel(n) {
      n = Math.min(100, Math.max(0, parseInt(n, 10) || 0));
      if (n <= 20) return 'Pre-Foundation';
      if (n <= 30) return 'Foundation 1';
      if (n <= 40) return 'Foundation 2';
      if (n <= 50) return 'Pre-Elementary';
      if (n <= 65) return 'Elementary';
      if (n <= 75) return 'Pre-Intermediate';
      if (n <= 85) return 'Intermediate';
      return 'Upper Intermediate';
    }
    return payload;
  }

  var storedApplication = null;
  try {
    var s = sessionStorage.getItem('placement_application');
    if (s) storedApplication = JSON.parse(s);
  } catch (e) {}

  function init() {
    showStep(1);
    fillDobDropdowns();
    if (storedApplication) {
      var pName = document.getElementById('pName');
      var pPhone = document.getElementById('pPhone');
      var pEmail = document.getElementById('pEmail');
      if (pName && storedApplication.name) pName.value = storedApplication.name;
      if (pPhone && storedApplication.phone) pPhone.value = storedApplication.phone;
      if (pEmail && storedApplication.email) pEmail.value = storedApplication.email || '';
    }
    var configReady = function(c) {
      var baseCfg = c || (window.AcademyContent && AcademyContent.DEFAULT_PLACEMENT_TEST);
      loadPlacementConfigWithQuestionBank(baseCfg, function(finalCfg) {
        var sessionCfg = prepareStudentQuestionSession(finalCfg || baseCfg);
        applyConfig(sessionCfg);
        var backBtn = document.getElementById('ptStep6ButtonBack');
        if (backBtn) {
          backBtn.setAttribute('href', 'admin/admissions.html');
          backBtn.textContent = 'Admin Panel ';
        }
        bindEvents();
        var stored = getCertificatePayloadFromStorage();
        if (stored) updateCertificateButtonVisibility(stored);
        loadResultFromCertificateToken();
      });
    };
    if (window.AcademyContent && AcademyContent.getPlacementTestConfig) {
      AcademyContent.getPlacementTestConfig(configReady);
    } else {
      configReady(window.AcademyContent && AcademyContent.DEFAULT_PLACEMENT_TEST);
    }
  }

  function bindEvents() {
    var phoneElInit = document.getElementById('pPhone');
    if (phoneElInit) {
      phoneElInit.addEventListener('input', function() {
        var v = normalizePhoneInput(phoneElInit.value);
        if (v !== phoneElInit.value) phoneElInit.value = v;
      });
    }
    var phoneCountryEl = document.getElementById('pPhoneCountry');
    if (phoneCountryEl) {
      phoneCountryEl.addEventListener('change', applyCountryPrefixIfNeeded);
      phoneCountryEl.addEventListener('change', updatePhoneFlagDisplay);
      updatePhoneFlagDisplay();
    }
    var certBtn = document.getElementById('ptDownloadCertificateBtn');
    if (certBtn) {
      certBtn.addEventListener('click', function() {
        var payload = getActiveCertificatePayload();
        downloadCertificatePdf(payload);
      });
    }
    var btnNext2 = document.getElementById('nextTo2');
    if (btnNext2) btnNext2.addEventListener('click', function() {
      var name = document.getElementById('pName').value.trim();
      var phone = normalizePhoneInput(document.getElementById('pPhone').value);
      var parentName = (document.getElementById('pParentName') && document.getElementById('pParentName').value || '').trim();
      var dob = getDobValue();
      var emailEl = document.getElementById('pEmail');
      var email = emailEl ? String(emailEl.value || '').trim() : '';
      if (!name || !phone || !parentName) { alert('Please fill Student Name, Phone Number, and Parent Name.'); return; }
      if (!dob) { alert('Date of Birth (Day, Month, Year) '); return; }
      applyCountryPrefixIfNeeded();
      checkRetakeEligibility({ name: name, phone: phone, email: email, date_of_birth: dob, parent_name: parentName }).then(function(stat) {
        var canTake = !(stat && stat.ok === false) && !(stat && stat.can_take_test === false);
        if (!canTake) {
          var msg = String((stat && stat.message) || '');
          if (!msg) {
            if (stat && stat.has_passed) msg = 'You already passed this test and cannot retake.';
            else if (stat && stat.days_until_next_attempt) msg = 'You can take this test again in ' + stat.days_until_next_attempt + ' day(s).';
            else msg = 'You are not allowed to retake this test.';
          }
          alert(msg);
          return;
        }
        showStep(2);
        var audio = document.getElementById('listeningAudio');
        if (audio && !audio.src && ptConfig && ptConfig.step2 && ptConfig.step2.audioUrl) {
          audio.src = ptConfig.step2.audioUrl;
        }
      }).catch(function() {
        showStep(2);
        var audio = document.getElementById('listeningAudio');
        if (audio && !audio.src && ptConfig && ptConfig.step2 && ptConfig.step2.audioUrl) {
          audio.src = ptConfig.step2.audioUrl;
        }
      });
    });

    var step2StartBtn = document.getElementById('step2StartBtn');
    if (step2StartBtn) {
      step2StartBtn.addEventListener('click', function() {
        var intro = document.getElementById('step2Intro');
        var wrap = document.getElementById('step2QuestionsWrap');
        if (intro) intro.style.display = 'none';
        if (wrap) wrap.style.display = '';
        playCount = 0;
        var playBtnReset = document.getElementById('step2PlayBtn');
        if (playBtnReset) playBtnReset.disabled = false;
        var playLabReset = document.getElementById('playCountLabel');
        if (playLabReset) playLabReset.textContent = 'Plays left: ' + listenLimit;
        renderListeningQuestion(listeningQuestionIndex || 0);
        stopListeningTimer();
        startListeningTimerIfNeeded();
      });
    }

    var audio = document.getElementById('listeningAudio');
    if (audio) {
      audio.addEventListener('play', function() {
        playCount++;
        var lab = document.getElementById('playCountLabel');
        if (lab) lab.textContent = 'Plays left: ' + Math.max(0, listenLimit - playCount);
        if (playCount >= listenLimit) {
          audio.pause();
          var playBtn = document.getElementById('step2PlayBtn');
          if (playBtn) playBtn.disabled = true;
          if (lab) lab.textContent = 'Plays left: 0';
        }
      });
      audio.addEventListener('timeupdate', function() {
        var disp = document.getElementById('step2TimeDisplay');
        if (disp) {
          var t = audio.currentTime;
          var d = audio.duration;
          if (isNaN(d) || d <= 0) d = 0;
          var pad = function(n) { return (n < 10 ? '0' : '') + n; };
          disp.textContent = pad(Math.floor(t / 60)) + ':' + pad(Math.floor(t % 60)) + ' / ' + pad(Math.floor(d / 60)) + ':' + pad(Math.floor(d % 60));
        }
      });
      audio.addEventListener('loadedmetadata', function() {
        var disp = document.getElementById('step2TimeDisplay');
        if (disp && !isNaN(audio.duration) && audio.duration > 0) {
          var d = audio.duration;
          var pad = function(n) { return (n < 10 ? '0' : '') + n; };
          disp.textContent = '00:00 / ' + pad(Math.floor(d / 60)) + ':' + pad(Math.floor(d % 60));
        }
      });
    }

    var step2PlayBtn = document.getElementById('step2PlayBtn');
    if (step2PlayBtn && audio) {
      step2PlayBtn.addEventListener('click', function() {
        if (playCount >= listenLimit) return;
        audio.play();
      });
    }

    var playLab = document.getElementById('playCountLabel');
    if (playLab) playLab.textContent = 'Plays left: ' + listenLimit;

    var step2Questions = document.getElementById('step2Questions');
    if (step2Questions) {
      step2Questions.addEventListener('change', function(e) {
        var t = e && e.target;
        if (!t || t.name !== 'listening_current') return;
        listeningAnswers[listeningQuestionIndex] = t.value || '';
        renderListeningNavigator();
        updateExamProgressUI();
      });
    }

    var step2PrevBtn = document.getElementById('step2PrevBtn');
    if (step2PrevBtn) {
      step2PrevBtn.addEventListener('click', function() {
        renderListeningQuestion(listeningQuestionIndex - 1);
      });
    }

    var step2NextBtn = document.getElementById('step2NextBtn');
    if (step2NextBtn) {
      step2NextBtn.addEventListener('click', function() {
        renderListeningQuestion(listeningQuestionIndex + 1);
      });
    }

    var step2Navigator = document.getElementById('step2Navigator');
    if (step2Navigator) {
      step2Navigator.addEventListener('click', function(e) {
        var btn = e.target && e.target.closest ? e.target.closest('button[data-step2-nav]') : null;
        if (!btn) return;
        var idx = parseInt(btn.getAttribute('data-step2-nav'), 10);
        if (isNaN(idx)) return;
        renderListeningQuestion(idx);
      });
    }

    var submitModalOverlay = document.getElementById('ptSubmitModalOverlay');
    var submitModalMessage = document.getElementById('ptSubmitModalMessage');
    function closeSubmitModal() {
      if (submitModalOverlay) submitModalOverlay.style.display = 'none';
    }
    function openSubmitModal() {
      var answeredAll = getOverallAnsweredCount();
      var totalAll = getOverallQuestionCount();
      var unanswered = Math.max(0, totalAll - answeredAll);
      if (submitModalMessage) {
        submitModalMessage.textContent = 'You have answered ' + answeredAll + ' out of ' + totalAll + ' questions. Unanswered: ' + unanswered + '. Are you sure you want to submit?';
      }
      if (submitModalOverlay) submitModalOverlay.style.display = 'flex';
    }
    var submitExamBtn = document.getElementById('ptSubmitExamBtn');
    if (submitExamBtn) submitExamBtn.addEventListener('click', openSubmitModal);
    var submitModalCancel = document.getElementById('ptSubmitModalCancel');
    if (submitModalCancel) submitModalCancel.addEventListener('click', closeSubmitModal);
    var submitModalClose = document.getElementById('ptSubmitModalClose');
    if (submitModalClose) submitModalClose.addEventListener('click', closeSubmitModal);
    var submitModalConfirm = document.getElementById('ptSubmitModalConfirm');
    if (submitModalConfirm) {
      submitModalConfirm.addEventListener('click', function() {
        closeSubmitModal();
        doSubmit();
      });
    }

    var ptModalOverlay = document.getElementById('ptModalOverlay');
    var ptModalGoBack = document.getElementById('ptModalGoBack');
    var ptModalNext = document.getElementById('ptModalNext');
    var ptModalClose = document.getElementById('ptModalClose');
    var pendingNextAction = null;
    function showModal(callback) {
      pendingNextAction = callback;
      if (ptModalOverlay) ptModalOverlay.style.display = 'flex';
    }
    function hideModal() {
      pendingNextAction = null;
      if (ptModalOverlay) ptModalOverlay.style.display = 'none';
    }
    if (ptModalGoBack) ptModalGoBack.addEventListener('click', hideModal);
    if (ptModalNext) ptModalNext.addEventListener('click', function() {
      if (typeof pendingNextAction === 'function') pendingNextAction();
      hideModal();
    });
    if (ptModalClose) ptModalClose.addEventListener('click', hideModal);

    document.getElementById('nextTo3').addEventListener('click', function() {
      var nextAfterListening = speakingEnabled ? 3 : 4;
      var total = (ptConfig && ptConfig.step2 && ptConfig.step2.questions) ? ptConfig.step2.questions.length : 0;
      var answered = listeningAnswers.filter(function(v) { return !!v; }).length;
      if (total > 0 && answered < total) {
        showModal(function() { showStep(nextAfterListening); });
      } else {
        showStep(nextAfterListening);
      }
    });
    document.getElementById('nextTo4').addEventListener('click', function() {
      if (currentStep === 4 && ptConfig && ptConfig.step3 && ptConfig.step3.items && ptConfig.step3.items.length) {
        var r = document.querySelector('input[name="reading_current"]:checked');
        readingAnswers[readingQuestionIndex] = r ? r.value : '';
        readingQuestionIndex++;
        if (readingQuestionIndex < ptConfig.step3.items.length) {
          renderReadingQuestion(readingQuestionIndex);
        } else {
          var totalR = ptConfig.step3.items.length;
          if (readingAnswers.length < totalR) {
            showModal(function() { showStep(5); });
          } else {
            showStep(5);
          }
        }
      } else {
        showStep(5);
      }
    });
    var step4StartBtn = document.getElementById('step4StartBtn');
    if (step4StartBtn) {
      step4StartBtn.addEventListener('click', function() {
        var intro4 = document.getElementById('step4Intro');
        var wrap4 = document.getElementById('step4TasksWrap');
        if (intro4) intro4.style.display = 'none';
        if (wrap4) wrap4.style.display = '';
        writingPromptIndex = 0;
        writingAnswers = [];
        renderWritingPrompt(0);
        startWritingTimerIfNeeded();
      });
    }

    document.getElementById('nextTo5').addEventListener('click', function() {
      var textarea = document.getElementById('writingText');
      if (textarea) writingAnswers[writingPromptIndex] = textarea.value;
      if (writingPrompts.length && writingPromptIndex < writingPrompts.length - 1) {
        writingPromptIndex++;
        renderWritingPrompt(writingPromptIndex);
      } else {
        doSubmit();
      }
    });

    var writingText = document.getElementById('writingText');
    if (writingText) {
      writingText.addEventListener('input', function() {
        var wc = document.getElementById('wordCount');
        if (wc) wc.textContent = (this.value.match(/\S+/g) || []).length;
      });
    }

    /* Step 5: Speaking – intro → mic → Part 1 → task (play → record → Done) */
    var step5StartBtn = document.getElementById('step5StartBtn');
    if (step5StartBtn) step5StartBtn.addEventListener('click', function() {
      var i5 = document.getElementById('step5Intro');
      var m5 = document.getElementById('step5MicCard');
      if (i5) i5.style.display = 'none';
      if (m5) m5.style.display = 'block';
    });

    var step5AllowMic = document.getElementById('step5AllowMic');
    if (step5AllowMic) step5AllowMic.addEventListener('click', function() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Microphone not supported. Please use HTTPS.');
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
        micStream = stream;
        var m5 = document.getElementById('step5MicCard');
        var p5 = document.getElementById('step5Part1Intro');
        if (m5) m5.style.display = 'none';
        if (p5) p5.style.display = 'block';
      }).catch(function() {
        alert('Please allow microphone access to continue the speaking test.');
      });
    });

    var step5SkipSpeaking = document.getElementById('step5SkipSpeaking');
    if (step5SkipSpeaking) step5SkipSpeaking.addEventListener('click', function() {
      recordedBlob = null;
      showStep(4);
    });

    var step5Part1Start = document.getElementById('step5Part1Start');
    if (step5Part1Start) step5Part1Start.addEventListener('click', function() {
      var p5 = document.getElementById('step5Part1Intro');
      var t5 = document.getElementById('step5TaskWrap');
      if (p5) p5.style.display = 'none';
      if (t5) t5.style.display = 'block';
      speakingPhase = 'play';
      var titleEl = document.getElementById('step5TaskTitle');
      var instrEl = document.getElementById('step5TaskInstruction');
      var qWrap = document.getElementById('step5QuestionBoxWrap');
      var countWrap = document.getElementById('step5CountdownWrap');
      var waveWrap = document.getElementById('step5WaveformWrap');
      var timeEl = document.getElementById('step5TimeRemaining');
      var doneBtn = document.getElementById('step5DoneBtn');
      if (titleEl) titleEl.textContent = 'Speaking task';
      if (instrEl) instrEl.textContent = speakingInstructionText ? 'Read the prompt and click play when ready.' : "When you're ready, click play.";
      if (qWrap) qWrap.style.display = speakingInstructionText ? 'block' : 'none';
      var questionTextEl = document.getElementById('step5QuestionText');
      if (questionTextEl && speakingInstructionText) questionTextEl.textContent = speakingInstructionText;
      if (countWrap) countWrap.style.display = 'none';
      if (waveWrap) waveWrap.style.display = 'flex';
      if (timeEl) timeEl.style.display = 'none';
      if (doneBtn) doneBtn.style.display = 'none';
    });

    function startSpeakingRecord(seconds) {
      recordSecondsLeft = seconds;
      var timeVal = document.getElementById('step5TimeValue');
      if (timeVal) timeVal.textContent = '00:' + (recordSecondsLeft < 10 ? '0' : '') + recordSecondsLeft;
      if (recordTimerId) clearInterval(recordTimerId);
      recordTimerId = setInterval(function() {
        recordSecondsLeft--;
        if (timeVal) timeVal.textContent = '00:' + (recordSecondsLeft < 10 ? '0' : '') + recordSecondsLeft;
        if (recordSecondsLeft <= 0) {
          clearInterval(recordTimerId);
          recordTimerId = null;
          if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        }
      }, 1000);
      if (micStream && (!mediaRecorder || mediaRecorder.state === 'inactive')) {
        chunks = [];
        mediaRecorder = new MediaRecorder(micStream);
        mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) chunks.push(e.data); };
        mediaRecorder.onstop = function() {
          if (chunks.length) recordedBlob = new Blob(chunks, { type: 'audio/webm' });
        };
        mediaRecorder.start();
      }
    }

    var step5PlayBtn = document.getElementById('step5PlayBtn');
    var step5TaskAudio = document.getElementById('step5TaskAudio');
    if (step5PlayBtn) step5PlayBtn.addEventListener('click', function() {
      if (speakingPhase !== 'play') return;
      var instrEl = document.getElementById('step5TaskInstruction');
      var waveWrap = document.getElementById('step5WaveformWrap');
      var timeEl = document.getElementById('step5TimeRemaining');
      var doneBtn = document.getElementById('step5DoneBtn');
      if (step5TaskAudio && step5TaskAudio.src) {
        step5TaskAudio.play();
        step5TaskAudio.onended = function() {
          step5TaskAudio.onended = null;
          if (instrEl) instrEl.textContent = speakingInstructionText ? 'Now speak about the prompt.' : 'Now repeat what you heard.';
          if (waveWrap) waveWrap.style.display = 'none';
          if (timeEl) timeEl.style.display = 'block';
          if (doneBtn) doneBtn.style.display = 'block';
          speakingPhase = 'record';
          startSpeakingRecord(speakingRecordSeconds);
        };
      } else {
        if (instrEl) instrEl.textContent = speakingInstructionText ? 'Now speak about the prompt.' : 'Now repeat what you heard.';
        if (waveWrap) waveWrap.style.display = 'none';
        if (timeEl) timeEl.style.display = 'block';
        if (doneBtn) doneBtn.style.display = 'block';
        speakingPhase = 'record';
        startSpeakingRecord(speakingRecordSeconds);
      }
    });

    var step5DoneBtn = document.getElementById('step5DoneBtn');
    if (step5DoneBtn) step5DoneBtn.addEventListener('click', function() {
      if (recordTimerId) { clearInterval(recordTimerId); recordTimerId = null; }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      if (micStream) { micStream.getTracks().forEach(function(t) { t.stop(); }); micStream = null; }
      showStep(4);
    });

    var nextTo6 = document.getElementById('nextTo6');
    if (nextTo6) nextTo6.addEventListener('click', function() { doSubmit(); });

  }

  function fillDobDropdowns() {
    var daySel = document.getElementById('pDobDay');
    var monthSel = document.getElementById('pDobMonth');
    var yearSel = document.getElementById('pDobYear');
    if (!daySel || !monthSel || !yearSel) return;
    var i;
    for (i = 1; i <= 31; i++) daySel.appendChild(new Option(i < 10 ? '0' + i : '' + i, i < 10 ? '0' + i : '' + i));
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    for (i = 0; i < 12; i++) monthSel.appendChild(new Option(months[i], (i + 1) < 10 ? '0' + (i + 1) : '' + (i + 1)));
    var y = new Date().getFullYear();
    for (i = y; i >= y - 80; i--) yearSel.appendChild(new Option('' + i, '' + i));
  }

  function getDobValue() {
    var d = document.getElementById('pDobDay');
    var m = document.getElementById('pDobMonth');
    var y = document.getElementById('pDobYear');
    if (!d || !m || !y || !d.value || !m.value || !y.value) return '';
    return y.value + '-' + m.value + '-' + d.value;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
