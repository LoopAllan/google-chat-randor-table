'use strict';

/**
 * Finds GFM tables in plain text.
 * Pure: no DOM access, so it can be unit tested in isolation.
 */
(function (root) {
  const DELIMITER_CELL = /^:?-+:?$/;
  const UNESCAPED_PIPE = /(?<!\\)\|/;

  function splitRow(line) {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed.split(UNESCAPED_PIPE).map((cell) => cell.trim().replace(/\\\|/g, '|'));
  }

  function isRowLike(line) {
    return line.trim() !== '' && line.includes('|');
  }

  function parseDelimiter(line) {
    if (!line.includes('|')) {
      return null;
    }
    const cells = splitRow(line);
    if (!cells.every((cell) => DELIMITER_CELL.test(cell))) {
      return null;
    }
    return cells.map(alignmentOf);
  }

  function alignmentOf(cell) {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) {
      return 'center';
    }
    if (right) {
      return 'right';
    }
    return left ? 'left' : null;
  }

  function fitToWidth(cells, width) {
    const fitted = cells.slice(0, width);
    while (fitted.length < width) {
      fitted.push('');
    }
    return fitted;
  }

  /** Returns the table starting at lines[index], or null when lines[index] is not a table header. */
  function readTableAt(lines, index) {
    const headerLine = lines[index];
    const delimiterLine = lines[index + 1];
    if (delimiterLine === undefined || !isRowLike(headerLine)) {
      return null;
    }
    const align = parseDelimiter(delimiterLine);
    const header = splitRow(headerLine);
    if (align === null || align.length !== header.length) {
      return null;
    }

    // GFM drops cells beyond the header width when rendering; sourceRows keeps
    // them so an editor writing the table back does not lose data.
    const sourceRows = [];
    let next = index + 2;
    while (next < lines.length && isRowLike(lines[next])) {
      sourceRows.push(splitRow(lines[next]));
      next += 1;
    }
    const rows = sourceRows.map((cells) => fitToWidth(cells, header.length));
    return { table: { header, align, rows, sourceRows }, nextIndex: next };
  }

  /**
   * Returns every table with its [start, end) character offsets in `text`
   * (end excludes the newline after the last row), so callers can map a
   * table back to the DOM nodes it came from.
   */
  function findTables(text) {
    const rawLines = text.split('\n');
    const lines = rawLines.map((line) => line.replace(/\r$/, ''));
    const lineStarts = [];
    rawLines.reduce((offset, line) => {
      lineStarts.push(offset);
      return offset + line.length + 1;
    }, 0);

    const tables = [];
    let index = 0;
    while (index < lines.length) {
      const found = readTableAt(lines, index);
      if (found === null) {
        index += 1;
        continue;
      }
      const lastRow = found.nextIndex - 1;
      tables.push({
        ...found.table,
        start: lineStarts[index],
        end: lineStarts[lastRow] + lines[lastRow].length,
      });
      index = found.nextIndex;
    }
    return tables;
  }

  function containsTable(text) {
    return findTables(text).length > 0;
  }

  const api = { findTables, containsTable };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
