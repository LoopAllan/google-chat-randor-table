'use strict';

/**
 * Reads a table out of a paste, whatever it was copied from:
 * 1. plain text that is a markdown table (Notion, AI answers, docs) — the source wrote
 *    it as markdown on purpose, so it is the most faithful flavour. Notion's HTML, for
 *    one, splits each list item of a cell into a row of its own (verified 2026-11-16);
 * 2. the HTML <table> (Sheets, Excel, Docs, web pages) — keeps formatting;
 * 3. the TSV plain text spreadsheets also provide, when the HTML cannot be read.
 * TSV is only trusted next to an HTML table, so ordinary tab-separated text pastes normally.
 */
(function (root) {
  const HTML_TABLE = /<table[\s>]/i;
  const FENCED = /^```[\w-]*\n([\s\S]*)\n```$/;
  const MIN_ROWS = 2;
  const MIN_COLUMNS = 2;

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

  function padToWidest(rows) {
    const width = Math.max(0, ...rows.map((row) => row.length));
    return rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
  }

  /** A single cell, row or column copied from a sheet is not meant as a table. */
  const isTableSized = (rows) => rows.length >= MIN_ROWS && rows[0].length >= MIN_COLUMNS;
  const withoutAlignment = (rows) => ({ cells: rows, align: Array(rows[0].length).fill(null) });

  function createClipboardReader({ readHtmlTable, findTables, fromParsed }) {
    function fromSpreadsheet(html, text) {
      if (!HTML_TABLE.test(html)) {
        return null;
      }
      const fromHtml = readHtmlTable(html);
      if (fromHtml !== null && isTableSized(fromHtml)) {
        return withoutAlignment(fromHtml);
      }
      const fromTsv = padToWidest(parseTsv(text));
      return text.includes('\t') && isTableSized(fromTsv) ? withoutAlignment(fromTsv) : null;
    }

    /** Only when the whole paste is one table (optionally in a ``` fence); a table inside prose is left to Chat. */
    function fromMarkdown(text) {
      const trimmed = text.trim().replace(FENCED, '$1').trim();
      const tables = findTables(trimmed);
      if (tables.length !== 1 || tables[0].start !== 0 || tables[0].end !== trimmed.length) {
        return null;
      }
      return fromParsed(tables[0]);
    }

    /** @returns {{ cells: string[][], align: Array<string|null> } | null} first row is the header */
    function tableFromClipboard({ html, text }) {
      return fromMarkdown(text) ?? fromSpreadsheet(html, text);
    }

    /** Any block of cells, for pasting into the editor grid: no size or header requirements. */
    function gridFromClipboard({ html, text }) {
      const fromHtml = HTML_TABLE.test(html) ? readHtmlTable(html) : null;
      return fromMarkdown(text)?.cells ?? fromHtml ?? padToWidest(parseTsv(text));
    }

    return { tableFromClipboard, gridFromClipboard };
  }

  const api = { createClipboardReader };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
