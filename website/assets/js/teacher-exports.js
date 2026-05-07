/**
 * Client-side CSV download and print helpers for teacher pages.
 */
(function () {
  'use strict';

  function csvEscape(cell) {
    var s = cell == null ? '' : String(cell);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function tableToCsv(table) {
    if (!table) return '';
    var rows = table.querySelectorAll('tr');
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('th, td');
      var cols = [];
      for (var j = 0; j < cells.length; j++) {
        cols.push(csvEscape((cells[j].innerText || '').trim()));
      }
      lines.push(cols.join(','));
    }
    return lines.join('\r\n');
  }

  function downloadCsv(filename, csv) {
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function printTarget(el) {
    if (!el) return;
    el.classList.add('print-only-target');
    window.print();
    el.classList.remove('print-only-target');
  }

  window.TeacherExport = {
    tableToCsv: tableToCsv,
    downloadCsv: downloadCsv,
    printElement: printTarget
  };
})();
