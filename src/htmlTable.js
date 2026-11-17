'use strict';

/**
 * Reads the first <table> of clipboard HTML into rows of markdown cells, so a
 * table copied from anywhere (Google Sheets, Excel, Notion, Docs, Confluence,
 * web pages) pastes the same way.
 *
 * Each cell becomes markdown inline source: bold / italic / strikethrough
 * (tags or inline styles), inline code and links become markdown; line
 * breaks, paragraphs and list items become <br>-separated lines; merged cells
 * are spread out so columns stay aligned. parseHtml is injected (DOMParser in
 * the browser) and the parsed document is never attached to the page.
 */
(function (root) {
  const SKIPPED_TAGS = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'NOSCRIPT', 'COLGROUP', 'HEAD', 'TITLE']);
  const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'TABLE', 'TR']);
  const LINE = '\n';
  const CELL_LINE_BREAK = '<br>';
  const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
  // Plain text that would read as formatting once it is markdown. "_" is left alone:
  // the renderer ignores intraword underscores, so snake_case stays readable.
  const MARKDOWN_SPECIAL = /[*`~]/g;
  // Editors put one after an inline element so typing continues outside it; it is not content.
  const ZERO_WIDTH_SPACE = /\u200B/g;

  function createHtmlTableReader({ parseHtml }) {
    function formatsOf(element) {
      const { tagName, style } = element;
      const weight = style?.fontWeight ?? '';
      const decoration = `${style?.textDecoration ?? ''} ${style?.textDecorationLine ?? ''}`;
      // Google Docs wraps everything in <b style="font-weight:normal">, so an explicit weight wins.
      const bold = weight === ''
        ? tagName === 'STRONG' || tagName === 'B'
        : weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
      const italic = tagName === 'EM' || tagName === 'I' || style?.fontStyle === 'italic';
      const strike = tagName === 'S' || tagName === 'DEL' || tagName === 'STRIKE' || decoration.includes('line-through');
      return { bold, italic, strike };
    }

    /** Wraps every line of content in marker, keeping surrounding spaces outside the marker. */
    function wrap(content, marker) {
      return content.split(LINE).map((line) => {
        const [, before, text, after] = /^(\s*)(.*?)(\s*)$/s.exec(line);
        return text === '' ? line : `${before}${marker}${text}${marker}${after}`;
      }).join(LINE);
    }

    function applyFormats(element, content) {
      const { bold, italic, strike } = formatsOf(element);
      let formatted = content;
      if (strike) {
        formatted = wrap(formatted, '~~');
      }
      if (italic) {
        formatted = wrap(formatted, '*');
      }
      return bold ? wrap(formatted, '**') : formatted;
    }

    function safeHref(href) {
      try {
        const url = new URL(href);
        return LINK_PROTOCOLS.has(url.protocol) ? href : null;
      } catch {
        return null;
      }
    }

    /** A link whose text is its own URL (as a bare URL renders: https://a.tw -> href https://a.tw/). */
    function isOwnUrl(text, href) {
      try {
        return text === href || new URL(text).href === new URL(href).href;
      } catch {
        return false;
      }
    }

    function convertLink(element) {
      const text = convertChildren(element);
      const href = safeHref(element.getAttribute('href') ?? '');
      if (href === null) {
        return text;
      }
      return text.trim() === '' || isOwnUrl(text.trim(), href) ? text.trim() || href : `[${text.trim()}](${href})`;
    }

    function convertCode(element) {
      const code = element.textContent.replace(/\s+/g, ' ');
      return code.includes('`') ? `\`\` ${code} \`\`` : `\`${code}\``;
    }

    function convertList(element) {
      const ordered = element.tagName === 'OL';
      const items = [...element.children].filter((child) => child.tagName === 'LI');
      return items.map((item, index) => `${LINE}${ordered ? `${index + 1}. ` : '• '}${convertChildren(item)}${LINE}`).join('');
    }

    function convertElement(element) {
      const { tagName } = element;
      if (SKIPPED_TAGS.has(tagName)) {
        return '';
      }
      if (tagName === 'BR') {
        return LINE;
      }
      if (tagName === 'CODE') {
        return convertCode(element);
      }
      if (tagName === 'UL' || tagName === 'OL') {
        return convertList(element);
      }
      const content = tagName === 'A' ? convertLink(element) : convertChildren(element);
      const formatted = applyFormats(element, content);
      return BLOCK_TAGS.has(tagName) ? `${LINE}${formatted}${LINE}` : formatted;
    }

    function convertNode(node) {
      if (node.nodeType === 3) {
        return node.data.replace(ZERO_WIDTH_SPACE, '').replace(/\s+/g, ' ').replace(MARKDOWN_SPECIAL, '\\$&');
      }
      return node.nodeType === 1 ? convertElement(node) : '';
    }

    function convertChildren(element) {
      return [...element.childNodes].map(convertNode).join('');
    }

    /** One cell element as markdown inline source, with line breaks as <br>. */
    function cellMarkdown(cell) {
      return applyFormats(cell, convertChildren(cell))
        .split(LINE)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line !== '')
        .join(CELL_LINE_BREAK);
    }

    /** Places every cell in a grid, spreading colspan / rowspan so later cells land in their real column. */
    function toGrid(table) {
      const rows = [...table.rows];
      const grid = rows.map(() => []);
      rows.forEach((row, rowIndex) => {
        let column = 0;
        [...row.cells].forEach((cell) => {
          while (grid[rowIndex][column] !== undefined) {
            column += 1;
          }
          const value = cellMarkdown(cell);
          const rowSpan = Math.min(Math.max(1, cell.rowSpan), rows.length - rowIndex);
          const colSpan = Math.max(1, cell.colSpan);
          for (let down = 0; down < rowSpan; down += 1) {
            for (let across = 0; across < colSpan; across += 1) {
              grid[rowIndex + down][column + across] = down === 0 && across === 0 ? value : '';
            }
          }
          column += colSpan;
        });
      });
      const width = Math.max(0, ...grid.map((cells) => cells.length));
      return grid.map((cells) => Array.from({ length: width }, (_, column) => cells[column] ?? ''));
    }

    /** @returns {string[][] | null} rows of markdown cells, or null when there is no table */
    function readHtmlTable(html) {
      if (html === '') {
        return null;
      }
      const table = parseHtml(html).querySelector('table');
      return table === null ? null : toGrid(table);
    }

    return { readHtmlTable, readCell: cellMarkdown };
  }

  const api = { createHtmlTableReader };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
