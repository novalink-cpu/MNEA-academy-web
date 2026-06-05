(function () {
  'use strict';

  var Bre = window.BrePlacementBank;
  var SECTION_RANGES = {
    Listening: [1, 20],
    Grammar: [21, 50],
    Vocabulary: [51, 70],
    Reading: [71, 80]
  };
  var PANEL_SECTION = {
    listening: 'Listening',
    grammar: 'Grammar',
    vocabulary: 'Vocabulary',
    reading: 'Reading'
  };
  /** Skill sections in live test order (by question number). */
  var SKILL_SECTION_MENU = [
    { key: 'listening', section: 'Listening', icon: '🎧', skillClass: 'qb-skill-listening' },
    { key: 'grammar', section: 'Grammar', icon: '📝', skillClass: 'qb-skill-grammar' },
    { key: 'vocabulary', section: 'Vocabulary', icon: '📚', skillClass: 'qb-skill-vocabulary' },
    { key: 'reading', section: 'Reading', icon: '📖', skillClass: 'qb-skill-reading' }
  ];

  /** Admin reading passage headings (IDs unchanged in data). */
  var TEST1A_PASSAGE_LABELS = {
    t1r1: 'Read an email about parking. Then answer questions 71-73',
    t1r2: 'Read a page from a website about Cornwall. Then answer questions 74-76.',
    t1r3: 'Read an article about Wilbur and Orville Wright. Then answer questions 77-80.'
  };
  var TEST2A_PASSAGE_LABELS = {
    t2r1: 'Read an announcement about a bike share programme. Then answer questions 71-73.',
    t2r2: 'Read two flat reviews. Then answer questions 74-76.',
    t2r3: 'Read an article about Tadao Ando. Then answer questions 77-80.'
  };

  function passageDisplayLabel(passageId) {
    var key = String(passageId || '').trim();
    if (state.activeForm === 'test2a') return TEST2A_PASSAGE_LABELS[key] || 'Passage: ' + key;
    if (state.activeForm === 'test1a') return TEST1A_PASSAGE_LABELS[key] || 'Passage: ' + key;
    return 'Passage: ' + key;
  }

  var FORCE_LOCAL_AUDIO_MODE = true;
  var qbIgnoreHistory = false;
  var qbHistoryReady = false;
  var state = {
    activeForm: 'test1a',
    banks: { test1a: null, test2a: null },
    updatedAt: ''
  };

  function qbUrl() {
    return window.location.pathname + window.location.search;
  }

  function qbHistoryState(step, panel) {
    return { qb: 1, step: step, form: state.activeForm, panel: panel || '' };
  }

  function qbWriteHistory(step, panel, mode) {
    if (qbIgnoreHistory || !window.history || !history.pushState) return;
    try {
      var url = qbUrl();
      var st = qbHistoryState(step, panel);
      if (mode === 'push') history.pushState(st, '', url);
      else history.replaceState(st, '', url);
    } catch (e) {}
  }

  function onQbPopState(ev) {
    var st = ev && ev.state;
    qbIgnoreHistory = true;
    try {
      if (!st || !st.qb) return;
      if (st.form === 'test1a' || st.form === 'test2a') state.activeForm = st.form;
      if (st.step === 'forms') applyFormPickView();
      else if (st.step === 'sections') applySectionMenuView();
      else if (st.step === 'panel' && st.panel) applyPanelView(st.panel);
    } finally {
      qbIgnoreHistory = false;
    }
  }

  function initQbHistory() {
    if (qbHistoryReady) return;
    qbHistoryReady = true;
    qbWriteHistory('forms', '', 'replace');
    window.addEventListener('popstate', onQbPopState);
  }

  function esc(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var REVIEW_HEADER_ONLY_RE =
    /^[\uF0B7\u2022\u25A1\u2610\u25AA\uF097\-\*\s\u00A0]*([A-Z]\.\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s*\([^)]+\))$/;

  /** Put reviewer name/date on its own line before review body text. */
  function splitReviewHeadersInText(text) {
    return String(text || '').replace(
      /([A-Z]\.\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\s*\([^)]+\))\s+(?=[A-Za-z"'(])/g,
      '$1\n'
    );
  }

  /** Join soft line breaks; keep blank-line paragraphs. Preserves email From/To header lines. */
  function normalizePassageBodyText(body) {
    var text = splitReviewHeadersInText(String(body || '').trim());
    if (!text) return '';
    return text
      .split(/\n\s*\n+/)
      .map(function (block) {
        var lines = block
          .split(/\r?\n/)
          .map(function (line) {
            return line.trim();
          })
          .filter(Boolean);
        var out = [];
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (i > 0 && REVIEW_HEADER_ONLY_RE.test(lines[i - 1])) {
            out.push('\n');
          } else if (i > 0) {
            out.push(' ');
          }
          out.push(line);
        }
        return out.join('');
      })
      .filter(Boolean)
      .join('\n\n');
  }

  function normalizePassageText(text) {
    var raw = String(text || '').trim();
    if (!raw) return '';
    var lines = raw.split(/\r?\n/);
    if (!/^From:\s*/i.test(lines[0] || '')) return normalizePassageBodyText(raw);
    var i = 0;
    var header = [];
    if (/^From:\s*/i.test(lines[0])) {
      header.push(lines[0]);
      i = 1;
    }
    if (lines[i] && /^To:\s*/i.test(lines[i])) {
      header.push(lines[i]);
      i += 1;
    }
    while (i < lines.length && !String(lines[i]).trim()) i += 1;
    var bodyNorm = normalizePassageBodyText(lines.slice(i).join('\n'));
    return bodyNorm ? header.join('\n') + '\n\n' + bodyNorm : header.join('\n');
  }

  function setStatus(msg, tone) {
    var text = String(msg || '').trim();
    var statusEl = document.getElementById('qbStatusText');
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.hidden = !text;
    }
    var saveStatusEl = document.getElementById('qbSaveStatus');
    if (saveStatusEl) {
      saveStatusEl.textContent = text;
      saveStatusEl.hidden = !text;
      saveStatusEl.classList.remove('qb-save-ok', 'qb-save-err');
      if (tone === 'ok') saveStatusEl.classList.add('qb-save-ok');
      if (tone === 'err') saveStatusEl.classList.add('qb-save-err');
    }
  }

  function cloneBank(bank) {
    if (!Bre || !Bre.normalizeBreBank) return bank;
    return Bre.normalizeBreBank(JSON.parse(JSON.stringify(bank || {})));
  }

  function defaultBanks() {
    if (!Bre || !Bre.getDefaultBanks) return { test1a: { title: '', audioUrl: '', passages: {}, questions: [] }, test2a: { title: '', audioUrl: '', passages: {}, questions: [] } };
    var d = Bre.getDefaultBanks();
    return { test1a: cloneBank(d.test1a), test2a: cloneBank(d.test2a) };
  }

  function activeBank() {
    return state.banks[state.activeForm] || { title: '', audioUrl: '', passages: {}, questions: [] };
  }

  function setActiveBank(bank) {
    state.banks[state.activeForm] = cloneBank(bank);
  }

  function questionsInRange(minNo, maxNo) {
    return (activeBank().questions || [])
      .filter(function (q) {
        return q && q.no >= minNo && q.no <= maxNo;
      })
      .sort(function (a, b) {
        return a.no - b.no;
      });
  }

  function questionsForSection(sectionName) {
    var range = SECTION_RANGES[sectionName];
    if (!range) return [];
    return questionsInRange(range[0], range[1]);
  }

  function sectionRangeLabel(sectionName) {
    var range = SECTION_RANGES[sectionName];
    if (!range) return '';
    return 'Q' + range[0] + '–' + range[1];
  }

  function passageEntriesFromBank() {
    var bank = activeBank();
    var passages = bank.passages && typeof bank.passages === 'object' ? bank.passages : {};
    var readingIds = {};
    questionsInRange(71, 80).forEach(function (q) {
      var id = String(q.passageId || '').trim();
      if (id) readingIds[id] = true;
    });
    return Object.keys(passages)
      .filter(function (id) {
        var key = String(id || '').trim();
        if (!key) return false;
        return readingIds[key] || String(passages[id] || '').trim();
      })
      .sort();
  }

  function buildSectionMenuItems() {
    var items = [];
    SKILL_SECTION_MENU.forEach(function (def) {
      var list = questionsForSection(def.section);
      if (!list.length) return;
      items.push({
        key: def.key,
        icon: def.icon,
        title: def.section + ' (' + list.length + ')',
        sub: sectionRangeLabel(def.section),
        hint: sectionRangeLabel(def.section) + ' ' + def.section,
        skillClass: def.skillClass
      });
    });
    return items;
  }

  function renderSectionMenuCards() {
    var grid = document.getElementById('qbSectionMenuGrid');
    var hintEl = document.getElementById('qbSectionMenuHint');
    var items = buildSectionMenuItems();
    if (grid) {
      grid.innerHTML = items
        .map(function (it) {
          return (
            '<button type="button" class="qb-menu-card ' +
            it.skillClass +
            '" data-open-panel="' +
            esc(it.key) +
            '">' +
            '<span class="qb-menu-icon">' +
            it.icon +
            '</span>' +
            '<h3>' +
            esc(it.title) +
            '</h3>' +
            '<p>' +
            esc(it.sub) +
            '</p></button>'
          );
        })
        .join('');
    }
    if (hintEl) {
      var hints = items.filter(function (it) {
        return it.key === 'listening' || it.key === 'grammar' || it.key === 'vocabulary' || it.key === 'reading';
      });
      hintEl.textContent = hints.length
        ? 'Choose a section to edit. ' + hints.map(function (it) { return it.hint; }).join(' · ') + '.'
        : 'No question data for this paper yet.';
    }
  }

  function createQuestionRow(q) {
    var opts = (q.options || []).slice(0, 4);
    while (opts.length < 4) opts.push({ key: String.fromCharCode(65 + opts.length), text: '' });
    var optionsHtml = opts
      .map(function (opt, i) {
        var k = String(opt.key || String.fromCharCode(65 + i)).toUpperCase();
        return (
          '<div><label class="qb-label">Option ' +
          k +
          '</label><input class="qb-input" data-field="opt" data-opt="' +
          k +
          '" value="' +
          esc(opt.text || '') +
          '"></div>'
        );
      })
      .join('');
    return (
      '<div class="qb-row" data-qno="' +
      q.no +
      '">' +
      '<label class="qb-label qb-question-label">Question ' +
      q.no +
      '</label>' +
      '<textarea class="qb-textarea" data-field="prompt">' +
      esc(q.prompt || '') +
      '</textarea>' +
      '<div class="qb-grid4" style="margin-top:.5rem;">' +
      optionsHtml +
      '</div>' +
      '<div class="qb-grid2" style="margin-top:.55rem;">' +
      '<div><label class="qb-label">Correct</label><select class="qb-select" data-field="correct">' +
      ['A', 'B', 'C', 'D']
        .map(function (k) {
          return '<option value="' + k + '"' + (String(q.correct || 'A').toUpperCase() === k ? ' selected' : '') + '>' + k + '</option>';
        })
        .join('') +
      '</select></div>' +
      '</div></div>'
    );
  }

  function createPassageRow(passageId) {
    var passages = activeBank().passages || {};
    var id = String(passageId || '').trim();
    if (!id) return '';
    return (
      '<div class="qb-row qb-reading-passage-block" data-passage-id="' +
      esc(id) +
      '">' +
      '<div class="qb-head"><strong>' +
      esc(passageDisplayLabel(id)) +
      '</strong></div>' +
      '<label class="qb-label" style="margin-top:.45rem;">Text</label>' +
      '<textarea class="qb-textarea" data-field="passage-text" data-passage-id="' +
      esc(id) +
      '">' +
      esc(normalizePassageText(passages[id] || '')) +
      '</textarea></div>'
    );
  }

  function renderReadingPanel() {
    var container = document.getElementById('qb-reading-container');
    var titleEl = document.getElementById('qb-panel-title-reading');
    if (!container) return;
    var list = questionsForSection('Reading');
    if (titleEl) titleEl.textContent = 'Reading (' + sectionRangeLabel('Reading') + ')';
    var html = [];
    var lastPassageId = '';
    var linkedPassageIds = {};
    list.forEach(function (q) {
      var pid = String(q.passageId || '').trim();
      if (pid && pid !== lastPassageId) {
        html.push(createPassageRow(pid));
        linkedPassageIds[pid] = true;
        lastPassageId = pid;
      } else if (!pid) {
        lastPassageId = '';
      }
      html.push(createQuestionRow(q));
    });
    passageEntriesFromBank().forEach(function (pid) {
      if (!linkedPassageIds[pid]) html.push(createPassageRow(pid));
    });
    container.innerHTML = html.join('');
  }

  function renderSectionPanel(panelKey) {
    if (panelKey === 'reading') {
      renderReadingPanel();
      return;
    }
    var sectionName = PANEL_SECTION[panelKey];
    var container = document.getElementById('qb-' + panelKey + '-container');
    var titleEl = document.getElementById('qb-panel-title-' + panelKey);
    if (!container || !sectionName) return;
    var list = questionsForSection(sectionName);
    if (titleEl) {
      titleEl.textContent = sectionName + ' (' + sectionRangeLabel(sectionName) + ')';
    }
    container.innerHTML = list.map(createQuestionRow).join('');
  }

  function renderListeningSetup() {
    var wrap = document.getElementById('qb-listening-setup');
    var bank = activeBank();
    var hasListening = questionsInRange(1, 20).length > 0;
    if (wrap) wrap.classList.toggle('qb-hidden', !hasListening);
    var headingEl = document.getElementById('qbListeningAudioHeading');
    if (headingEl) headingEl.textContent = 'Listening Audio ( ' + formLabel() + ' )';
    var audioEl = document.getElementById('qbBankAudioUrl');
    if (audioEl) audioEl.value = bank.audioUrl || '';
  }

  function renderReadingPassagesBlock() {
    var wrap = document.getElementById('qb-reading-passages-wrap');
    if (wrap) wrap.classList.add('qb-hidden');
  }

  function renderAll() {
    renderSectionMenuCards();
    renderListeningSetup();
    renderReadingPassagesBlock();
    ['listening', 'grammar', 'vocabulary', 'reading'].forEach(renderSectionPanel);
    var sectionLabel = document.getElementById('qbSectionFormLabel');
    var activeLabel = formLabel();
    if (sectionLabel) sectionLabel.textContent = activeLabel;
  }

  function formLabel() {
    return state.activeForm === 'test2a' ? 'Test 2 Form A' : 'Test 1 Form A';
  }

  function syncFromDom() {
    var bank = activeBank();
    var audioEl = document.getElementById('qbBankAudioUrl');
    bank.audioUrl = audioEl ? String(audioEl.value || '').trim() : bank.audioUrl;

    var passages = bank.passages && typeof bank.passages === 'object' ? Object.assign({}, bank.passages) : {};
    document.querySelectorAll('#qbEditorShell [data-field="passage-text"][data-passage-id]').forEach(function (textEl) {
      var id = String(textEl.getAttribute('data-passage-id') || '').trim();
      if (!id) return;
      passages[id] = normalizePassageText(textEl.value || '');
    });
    bank.passages = passages;

    var byNo = {};
    (bank.questions || []).forEach(function (q) {
      if (q && q.no) byNo[q.no] = q;
    });

    document.querySelectorAll('#qbEditorShell .qb-row[data-qno]').forEach(function (row) {
      var no = parseInt(row.getAttribute('data-qno'), 10);
      if (!no || !byNo[no]) return;
      var q = byNo[no];
      var promptEl = row.querySelector('[data-field="prompt"]');
      var correctEl = row.querySelector('[data-field="correct"]');
      q.prompt = promptEl ? String(promptEl.value || '').trim() : q.prompt;
      q.correct = correctEl ? String(correctEl.value || 'A').trim().toUpperCase().charAt(0) : q.correct;
      q.options = ['A', 'B', 'C', 'D'].map(function (k) {
        var optEl = row.querySelector('[data-field="opt"][data-opt="' + k + '"]');
        return { key: k, text: optEl ? String(optEl.value || '').trim() : '' };
      });
    });

    bank.questions = Object.keys(byNo)
      .map(function (k) {
        return byNo[parseInt(k, 10)];
      })
      .sort(function (a, b) {
        return a.no - b.no;
      });
    setActiveBank(bank);
  }

  function buildPayload() {
    syncFromDom();
    return {
      test1a: cloneBank(state.banks.test1a),
      test2a: cloneBank(state.banks.test2a),
      updatedAt: new Date().toISOString()
    };
  }

  function applyLoadedData(data) {
    var defaults = defaultBanks();
    var d = data && typeof data === 'object' ? data : {};
    ['test1a', 'test2a'].forEach(function (key) {
      var src = d[key];
      if (Bre && Bre.isValidBreBank && Bre.isValidBreBank(src)) {
        state.banks[key] = cloneBank(src);
      } else {
        state.banks[key] = defaults[key];
      }
      var bank = state.banks[key];
      if (bank && bank.passages && typeof bank.passages === 'object') {
        Object.keys(bank.passages).forEach(function (pid) {
          bank.passages[pid] = normalizePassageText(bank.passages[pid]);
        });
      }
    });
    state.updatedAt = d.updatedAt || '';
    renderAll();
    setStatus('');
    showFormPick();
  }

  function loadData() {
    setStatus('Loading...');
    if (!window.SchoolAPI || !SchoolAPI.getPlacementQuestionBank) {
      applyLoadedData({});
      return;
    }
    SchoolAPI.getPlacementQuestionBank()
      .then(function (data) {
        applyLoadedData(data);
      })
      .catch(function () {
        applyLoadedData({});
        setStatus('Could not reach API. Showing built-in defaults.');
      });
  }

  function saveAll() {
    var btn = document.getElementById('qbSaveAllBottom');
    if (btn && btn.disabled) return;
    if (!window.SchoolAPI || !SchoolAPI.savePlacementQuestionBank) {
      setStatus('API unavailable. Open this page via app.py (e.g. http://localhost:5001), not as a file.', 'err');
      return;
    }
    if (btn) btn.disabled = true;
    setStatus('Saving...');
    var payload = buildPayload();
    SchoolAPI.savePlacementQuestionBank(payload)
      .then(function (res) {
        if (res && res.ok) {
          state.updatedAt = payload.updatedAt;
          setStatus('Saved to database at ' + new Date().toLocaleString('en-GB'), 'ok');
        } else {
          var errMsg = res && res.error ? String(res.error) : 'Save failed.';
          setStatus(errMsg, 'err');
        }
      })
      .catch(function (err) {
        setStatus('Save failed: ' + (err && err.message ? err.message : 'unknown error'), 'err');
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function getFirebaseStorageInstance() {
    if (typeof firebase === 'undefined' || !firebase.storage) return null;
    var cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.projectId || !cfg.apiKey) return null;
    try {
      firebase.app();
    } catch (e) {
      try {
        firebase.initializeApp(cfg);
      } catch (err) {}
    }
    try {
      return firebase.storage();
    } catch (err2) {
      return null;
    }
  }

  function sanitizeFileName(name) {
    return String(name || 'audio_file')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '')
      .toLowerCase();
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        resolve(typeof reader.result === 'string' ? reader.result : '');
      };
      reader.onerror = function () {
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
    });
  }

  function shouldUseLocalAudioMode() {
    if (FORCE_LOCAL_AUDIO_MODE) return true;
    var host = '';
    try {
      host = String((window.location && window.location.hostname) || '').toLowerCase();
    } catch (e) {}
    return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  }

  function uploadListeningAudioToFirebase(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        reject(new Error('Please choose an audio file first.'));
        return;
      }
      var storage = getFirebaseStorageInstance();
      if (!storage) {
        reject(new Error('Firebase Storage is not available.'));
        return;
      }
      var path = 'placement_test/audio/' + Date.now() + '_' + sanitizeFileName(file.name);
      storage
        .ref(path)
        .put(file)
        .then(function (snapshot) {
          return snapshot.ref.getDownloadURL();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function applyFormPickView() {
    var formLanding = document.getElementById('qbFormLanding');
    var sectionLanding = document.getElementById('qbSectionLanding');
    var shell = document.getElementById('qbEditorShell');
    if (formLanding) formLanding.classList.remove('qb-hidden');
    if (sectionLanding) sectionLanding.classList.add('qb-hidden');
    if (shell) shell.classList.add('qb-hidden');
    document.querySelectorAll('[data-open-panel]').forEach(function (btn) {
      btn.classList.remove('active');
    });
    document.querySelectorAll('.qb-panel').forEach(function (p) {
      p.classList.remove('active');
    });
  }

  function applySectionMenuView() {
    var formLanding = document.getElementById('qbFormLanding');
    var sectionLanding = document.getElementById('qbSectionLanding');
    var shell = document.getElementById('qbEditorShell');
    if (formLanding) formLanding.classList.add('qb-hidden');
    if (sectionLanding) sectionLanding.classList.remove('qb-hidden');
    if (shell) shell.classList.add('qb-hidden');
    document.querySelectorAll('.qb-panel').forEach(function (p) {
      p.classList.remove('active');
    });
    document.querySelectorAll('[data-open-panel]').forEach(function (btn) {
      btn.classList.remove('active');
    });
    renderAll();
  }

  function applyPanelView(key) {
    var formLanding = document.getElementById('qbFormLanding');
    var sectionLanding = document.getElementById('qbSectionLanding');
    var shell = document.getElementById('qbEditorShell');
    if (formLanding) formLanding.classList.add('qb-hidden');
    if (sectionLanding) sectionLanding.classList.add('qb-hidden');
    if (shell) shell.classList.remove('qb-hidden');
    document.querySelectorAll('[data-open-panel]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-open-panel') === key);
    });
    document.querySelectorAll('.qb-panel').forEach(function (p) {
      p.classList.remove('active');
    });
    var panel = document.getElementById('panel-' + key);
    if (panel) panel.classList.add('active');
    renderAll();
    if (panel && panel.scrollIntoView) {
      setTimeout(function () {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    }
  }

  function showFormPick() {
    syncFromDom();
    applyFormPickView();
    qbWriteHistory('forms', '', 'replace');
  }

  function showSectionMenu() {
    syncFromDom();
    applySectionMenuView();
    qbWriteHistory('sections', '', 'replace');
  }

  function goBackToSections() {
    syncFromDom();
    var st = history.state;
    if (st && st.qb && st.step === 'panel') {
      qbIgnoreHistory = true;
      history.back();
      qbIgnoreHistory = false;
      return;
    }
    showSectionMenu();
  }

  function pickForm(key) {
    if (key !== 'test1a' && key !== 'test2a') return;
    syncFromDom();
    state.activeForm = key;
    applySectionMenuView();
    qbWriteHistory('sections', '', 'push');
    setStatus('');
  }

  function showPanel(key) {
    if (!key) return;
    var allowed = buildSectionMenuItems().some(function (it) {
      return it.key === key;
    });
    if (!allowed) return;
    syncFromDom();
    applyPanelView(key);
    qbWriteHistory('panel', key, 'push');
  }

  function bindEvents() {
    document.querySelectorAll('[data-pick-form]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pickForm(btn.getAttribute('data-pick-form'));
      });
    });

    var sectionGrid = document.getElementById('qbSectionMenuGrid');
    if (sectionGrid) {
      sectionGrid.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-open-panel]');
        if (!btn) return;
        var key = btn.getAttribute('data-open-panel');
        if (key) showPanel(key);
      });
    }

    function applyListeningAudioFile(file) {
      if (!file) return;
      var applyUrl = function (url) {
        var audioEl = document.getElementById('qbBankAudioUrl');
        if (audioEl) audioEl.value = url;
        syncFromDom();
        setStatus('Audio URL updated. Click Save All to publish.');
      };
      if (shouldUseLocalAudioMode()) {
        fileToDataUrl(file).then(applyUrl).catch(function (err) {
          setStatus(err && err.message ? err.message : 'Local audio failed');
        });
        return;
      }
      setStatus('Uploading...');
      uploadListeningAudioToFirebase(file)
        .then(applyUrl)
        .catch(function () {
          fileToDataUrl(file).then(applyUrl).catch(function (err) {
            setStatus(err && err.message ? err.message : 'Upload failed');
          });
        });
    }

    var listeningAudioFile = document.getElementById('listeningAudioFile');
    if (listeningAudioFile) {
      listeningAudioFile.addEventListener('change', function () {
        var file = listeningAudioFile.files ? listeningAudioFile.files[0] : null;
        if (file) applyListeningAudioFile(file);
      });
    }

    var saveBottom = document.getElementById('qbSaveAllBottom');
    if (saveBottom) saveBottom.addEventListener('click', saveAll);

    initQbHistory();
    showFormPick();
  }

  function boot() {
    if (!Bre) {
      setStatus('BRE bank core script missing.');
      return;
    }
    state.banks = defaultBanks();
    var u = window.AcademyAuth && AcademyAuth.currentUser();
    if (!u) {
      window.location.href = '../public-page/login.html';
      return;
    }
    AcademyAuth.getUserProfile(u.uid, function (p) {
      if ((p && p.role) !== 'admin') {
        window.location.href = '../student/dashboard.html';
        return;
      }
      if (window.AdminTopToolbar) AdminTopToolbar.init();
      bindEvents();
      loadData();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
