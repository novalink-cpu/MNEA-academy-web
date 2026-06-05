from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / "website/assets/js/placement-test-bre.js"
out = ROOT / "website/assets/js/placement-bre-bank-core.js"
text = src.read_text(encoding="utf-8")
start = text.index("  function q(no")
end = text.index("  function getBank()")
chunk = text[start:end]
footer = r"""
  function normalizeBreQuestion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var no = parseInt(raw.no, 10);
    if (!no || no < 1 || no > 80) return null;
    var section = String(raw.section || '').trim();
    if (!section) return null;
    var opts = Array.isArray(raw.options) ? raw.options : [];
    var keys = ['A', 'B', 'C', 'D'];
    var options = keys.map(function (k) {
      var found = opts.find(function (o) { return o && String(o.key || '').toUpperCase() === k; });
      return { key: k, text: found ? String(found.text || '').trim() : '' };
    });
    var correct = String(raw.correct || 'A').trim().toUpperCase().charAt(0);
    if ('ABCD'.indexOf(correct) < 0) correct = 'A';
    return {
      no: no,
      section: section,
      prompt: String(raw.prompt || raw.text || '').trim(),
      options: options,
      correct: correct,
      passageId: String(raw.passageId || '').trim()
    };
  }

  function normalizeBreBank(bank) {
    var src = bank && typeof bank === 'object' ? bank : {};
    var passages = src.passages && typeof src.passages === 'object' ? src.passages : {};
    var outPassages = {};
    Object.keys(passages).forEach(function (k) {
      var id = String(k || '').trim();
      if (!id) return;
      outPassages[id] = String(passages[k] || '').trim();
    });
    var questions = [];
    (Array.isArray(src.questions) ? src.questions : []).forEach(function (q) {
      var nq = normalizeBreQuestion(q);
      if (nq) questions.push(nq);
    });
    questions.sort(function (a, b) { return a.no - b.no; });
    return {
      title: String(src.title || '').trim(),
      audioUrl: String(src.audioUrl || '').trim(),
      passages: outPassages,
      questions: questions
    };
  }

  function isValidBreBank(bank) {
    return normalizeBreBank(bank).questions.length >= 80;
  }

  function getDefaultBanks() {
    return { test1a: buildTest1A(), test2a: buildTest2A() };
  }

  global.BrePlacementBank = {
    buildTest1A: buildTest1A,
    buildTest2A: buildTest2A,
    parseBank: parseBank,
    getDefaultBanks: getDefaultBanks,
    normalizeBreBank: normalizeBreBank,
    isValidBreBank: isValidBreBank,
    BRE_SECTIONS: ['Listening', 'Grammar', 'Vocabulary', 'Reading'],
    BRE_FORMS: ['test1a', 'test2a']
  };
})(typeof window !== 'undefined' ? window : this);
"""
header = "(function (global) {\n  'use strict';\n\n"
out.write_text(header + chunk + footer, encoding="utf-8")
print("wrote", out, "bytes", out.stat().st_size)
