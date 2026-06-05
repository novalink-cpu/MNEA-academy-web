from pathlib import Path

p = Path(__file__).resolve().parents[1] / "website/admin/question-bank.html"
text = p.read_text(encoding="utf-8")
start = text.index("  <!-- legacy inline admin removed")
end = text.index('<script src="../assets/js/admin-badge.js"')
text = text[:start] + text[end:]
p.write_text(text, encoding="utf-8")
print("trimmed ok")
