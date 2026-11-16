'use strict';

/**
 * Reads a table out of clipboard data copied from Excel / Google Sheets.
 * The HTML flavour tells us the copy came from a table; the cells are read
 * from the TSV plain-text flavour, which is simpler and identical across apps.
 */
(function (root) {
  const HTML_TABLE = /<table[\s>]/i;

  /** Spreadsheet TSV: cells containing tabs, line breaks or quotes are quoted, quotes doubled. */
  function parseTsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let index = 0;

    const endCell = () => {
      row.push(cell);
      cell = '';
    };
    const endRow = () => {
      endCell();
      rows.push(row);
      row = [];
    };

    while (index < text.length) {
      const char = text[index];
      if (char === '"' && cell === '') {
        const close = readQuoted(text, index + 1);
        cell = close.value;
        index = close.nextIndex;
        continue;
      }
      if (char === '\t') {
        endCell();
      } else if (char === '\n') {
        endRow();
      } else if (char !== '\r') {
        cell += char;
      }
      index += 1;
    }
    if (cell !== '' || row.length > 0) {
      endRow();
    }
    return rows;
  }

  function readQuoted(text, start) {
    let value = '';
    let index = start;
    while (index < text.length) {
      if (text[index] === '"' && text[index + 1] === '"') {
        value += '"';
        index += 2;
      } else if (text[index] === '"') {
        return { value, nextIndex: index + 1 };
      } else {
        value += text[index];
        index += 1;
      }
    }
    return { value, nextIndex: index };
  }

  /** @returns {string[][] | null} rows (first row is the header), or null when it is not a table paste */
  function tableFromClipboard({ html, text }) {
    if (!HTML_TABLE.test(html) || text === '') {
      return null;
    }
    const rows = parseTsv(text);
    const width = Math.max(...rows.map((row) => row.length));
    if (rows.length < 2 || width < 2) {
      return null;
    }
    return rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
  }

  /** Any copied block of cells (no HTML or size requirements), for pasting into the editor grid. */
  function parseClipboardGrid(text) {
    return parseTsv(text);
  }

  const api = { tableFromClipboard, parseClipboardGrid };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
