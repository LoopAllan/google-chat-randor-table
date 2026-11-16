'use strict';

/** Writes rows as a GFM table; the inverse of tableParser for a single table. */
(function (root) {
  const DELIMITERS = { left: ':--', center: ':-:', right: '--:' };

  const CELL_LINE_BREAK = '<br>';

  /** A markdown row is one line: line breaks inside a cell become <br>, the most widely rendered convention. */
  function escapeCell(text) {
    return text.split(/\r?\n/).map((line) => line.trim()).join(CELL_LINE_BREAK).replace(/\|/g, '\\|').trim();
  }

  function writeRow(cells) {
    return `| ${cells.map(escapeCell).join(' | ')} |`;
  }

  /**
   * @param {string[][]} rows first row is the header
   * @param {{ fenced?: boolean, align?: Array<'left'|'center'|'right'|null> }} [options]
   *   fenced: wrap in ``` so Chat does not turn *x* / _x_ in cells into formatting
   */
  function toMarkdownTable(rows, { fenced = false, align = [] } = {}) {
    const [header, ...body] = rows;
    const delimiter = `| ${header.map((_, column) => DELIMITERS[align[column]] ?? '---').join(' | ')} |`;
    const table = [writeRow(header), delimiter, ...body.map(writeRow)].join('\n');
    return fenced ? `\`\`\`\n${table}\n\`\`\`` : table;
  }

  const api = { toMarkdownTable };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
