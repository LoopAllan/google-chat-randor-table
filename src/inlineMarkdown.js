'use strict';

/**
 * Renders the markdown inside one table cell: bold, italic, strikethrough,
 * inline code, links, bare URLs and <br> line breaks.
 *
 * The text comes from other people's messages, so the output is built only
 * with DOM APIs (createElement / createTextNode): any HTML other than <br>
 * stays literal text, and links are limited to http(s) and mailto.
 *
 * Deliberately smaller than CommonMark's delimiter algorithm: a delimiter
 * pairs with its nearest closer. That covers what people and tools write in
 * table cells, and anything unmatched simply stays literal.
 */
(function (root) {
  const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
  const WORD_CHARACTER = /[\p{L}\p{N}]/u;
  const LINE_BREAK = /^<br\s*\/?>/i;
  const AUTOLINK = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i;
  const BARE_URL = /^https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i;
  const URL_TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;
  const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
  /** Longest first, so "***" is not read as "**" + "*". */
  const EMPHASIS = [
    { marker: '***', tags: ['strong', 'em'] },
    { marker: '**', tags: ['strong'] },
    { marker: '__', tags: ['strong'] },
    { marker: '~~', tags: ['del'] },
    { marker: '*', tags: ['em'] },
    { marker: '_', tags: ['em'] },
    { marker: '~', tags: ['del'] },
  ];

  const isWhitespace = (char) => char === undefined || /\s/.test(char);
  const isWordCharacter = (char) => char !== undefined && WORD_CHARACTER.test(char);

  function safeHref(url) {
    try {
      const parsed = new URL(url);
      return LINK_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
    } catch {
      return null;
    }
  }

  function runLength(source, index, char) {
    let end = index;
    while (source[end] === char) {
      end += 1;
    }
    return end - index;
  }

  /** `code` with a matching backtick run; one surrounding space is stripped like CommonMark. */
  function readCode(source, index) {
    const length = runLength(source, index, '`');
    for (let close = source.indexOf('`', index + length); close !== -1; close = source.indexOf('`', close + 1)) {
      const closeLength = runLength(source, close, '`');
      if (closeLength === length) {
        let content = source.slice(index + length, close);
        if (content.length > 2 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
          content = content.slice(1, -1);
        }
        return { content, end: close + length };
      }
      close += closeLength - 1;
    }
    return null;
  }

  /** Index of the bracket closing source[index], honouring nesting and backslash escapes. */
  function matchingBracket(source, index, open, close) {
    let depth = 0;
    for (let position = index; position < source.length; position += 1) {
      const char = source[position];
      if (char === '\\') {
        position += 1;
      } else if (char === open) {
        depth += 1;
      } else if (char === close) {
        depth -= 1;
        if (depth === 0) {
          return position;
        }
      }
    }
    return -1;
  }

  /** [text](url "optional title"); null when malformed or the URL is not a safe link. */
  function readLink(source, index) {
    const textEnd = matchingBracket(source, index, '[', ']');
    if (textEnd === -1 || source[textEnd + 1] !== '(') {
      return null;
    }
    const urlEnd = matchingBracket(source, textEnd + 1, '(', ')');
    if (urlEnd === -1) {
      return null;
    }
    const [destination = ''] = source.slice(textEnd + 2, urlEnd).trim().split(/\s+/);
    const href = safeHref(destination.replace(/^<(.*)>$/, '$1'));
    return href === null ? null : { text: source.slice(index + 1, textEnd), href, end: urlEnd + 1 };
  }

  function readBareUrl(source, index) {
    if (isWordCharacter(source[index - 1])) {
      return null;
    }
    const match = BARE_URL.exec(source.slice(index));
    if (match === null) {
      return null;
    }
    let url = match[0].replace(URL_TRAILING_PUNCTUATION, '');
    // "(see https://a.tw/x)" — the closing parenthesis belongs to the sentence.
    const count = (char) => url.split(char).length - 1;
    while (url.endsWith(')') && count('(') < count(')')) {
      url = url.slice(0, -1);
    }
    const href = safeHref(url);
    return href === null ? null : { text: url, href, end: index + url.length };
  }

  function readEmphasis(source, index) {
    for (const { marker, tags } of EMPHASIS) {
      if (!source.startsWith(marker, index)) {
        continue;
      }
      const contentStart = index + marker.length;
      const intraword = marker[0] === '_';
      if (isWhitespace(source[contentStart]) || (intraword && isWordCharacter(source[index - 1]))) {
        continue;
      }
      for (let close = source.indexOf(marker, contentStart + 1); close !== -1; close = source.indexOf(marker, close + 1)) {
        const after = close + marker.length;
        if (isWhitespace(source[close - 1]) || (intraword && isWordCharacter(source[after]))) {
          continue;
        }
        // "*a**" must not close a single "*" with the first half of "**".
        if (source[after] === marker[0] && marker.length < 3) {
          continue;
        }
        return { tags, content: source.slice(contentStart, close), end: after };
      }
    }
    return null;
  }

  function createLink(doc, href) {
    const link = doc.createElement('a');
    link.setAttribute('href', href);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    return link;
  }

  function appendInline(doc, parent, source) {
    let text = '';
    const flush = () => {
      if (text !== '') {
        parent.appendChild(doc.createTextNode(text));
        text = '';
      }
    };
    const append = (node) => {
      flush();
      parent.appendChild(node);
      return node;
    };

    let index = 0;
    while (index < source.length) {
      const char = source[index];
      const rest = source.slice(index);

      if (char === '\\' && ASCII_PUNCTUATION.test(source[index + 1] ?? '')) {
        text += source[index + 1];
        index += 2;
        continue;
      }
      if (char === '`') {
        const code = readCode(source, index);
        if (code === null) {
          const length = runLength(source, index, '`');
          text += source.slice(index, index + length);
          index += length;
        } else {
          append(doc.createElement('code')).textContent = code.content;
          index = code.end;
        }
        continue;
      }
      if (char === '<') {
        const lineBreak = LINE_BREAK.exec(rest);
        if (lineBreak !== null) {
          append(doc.createElement('br'));
          index += lineBreak[0].length;
          continue;
        }
        const autolink = AUTOLINK.exec(rest);
        const href = autolink === null ? null : safeHref(autolink[1]);
        if (href !== null) {
          append(createLink(doc, href)).textContent = autolink[1];
          index += autolink[0].length;
          continue;
        }
      }
      if (char === '[') {
        const link = readLink(source, index);
        if (link !== null) {
          appendInline(doc, append(createLink(doc, link.href)), link.text);
          index = link.end;
          continue;
        }
      }
      if (char === '*' || char === '_' || char === '~') {
        const emphasis = readEmphasis(source, index);
        if (emphasis === null) {
          // An unmatched run stays literal as a whole, so "**x" is not re-read as "*" + "*x".
          const length = runLength(source, index, char);
          text += source.slice(index, index + length);
          index += length;
        } else {
          const outer = append(doc.createElement(emphasis.tags[0]));
          const inner = emphasis.tags.slice(1).reduce((element, tag) => element.appendChild(doc.createElement(tag)), outer);
          appendInline(doc, inner, emphasis.content);
          index = emphasis.end;
        }
        continue;
      }
      if (char === 'h' || char === 'H') {
        const url = readBareUrl(source, index);
        if (url !== null) {
          append(createLink(doc, url.href)).textContent = url.text;
          index = url.end;
          continue;
        }
      }
      text += char;
      index += 1;
    }
    flush();
  }

  /** @returns {DocumentFragment} */
  function renderInline(source, doc) {
    const fragment = doc.createDocumentFragment();
    appendInline(doc, fragment, source);
    return fragment;
  }

  const api = { renderInline };
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MdTable = Object.assign(root.MdTable || {}, api);
  }
})(globalThis);
