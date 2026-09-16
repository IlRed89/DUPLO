/**
 * @file markdown.js
 * @description Convertitore Markdown → HTML sufficiente per il README di DUPLO.
 * Funziona sia nel renderer (`<script>`) sia nei test Node (`module.exports`).
 * Non è un parser CommonMark completo: copre titoli, liste, tabelle, code fence, link.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.DuploMarkdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /**
   * Escape HTML per testo Markdown interpolato nel DOM.
   * @param {unknown} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Inline: link, code, grassetto. Si applica dopo escapeHtml.
   * @param {string} text
   * @returns {string}
   */
  function inline(text) {
    let out = escapeHtml(text);
    out = out.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    out = out.replace(/\[([^\]]+)\]\((#[^)]+)\)/g, '<a href="$2">$1</a>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return out;
  }

  /**
   * Ancora stile GitHub per i titoli, così i link dell'indice (#avvio) funzionano in-app.
   * @param {string} text
   * @returns {string}
   */
  function slugify(text) {
    return String(text)
      .trim()
      .toLowerCase()
      .replace(/[’'`]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Converte un documento Markdown (README) in HTML.
   * @param {unknown} md
   * @returns {string}
   */
  function markdownToHtml(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let i = 0;
    let inList = false;
    let listTag = 'ul';

    const closeList = () => {
      if (inList) {
        html.push(`</${listTag}>`);
        inList = false;
      }
    };

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('```')) {
        closeList();
        const code = [];
        i += 1;
        while (i < lines.length && !lines[i].startsWith('```')) {
          code.push(escapeHtml(lines[i]));
          i += 1;
        }
        html.push(`<pre><code>${code.join('\n')}</code></pre>`);
        i += 1;
        continue;
      }

      if (/^\s*\|.+\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*-/.test(lines[i + 1])) {
        closeList();
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim());
          rows.push(cells);
          i += 1;
        }
        const header = rows.shift() || [];
        const isSeparator = (row) => row.every((c) => /^:?-{2,}:?$/.test(String(c).replace(/\s/g, '')));
        if (rows.length && isSeparator(rows[0])) {
          rows.shift();
        }
        let table = '<table><thead><tr>' + header.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
        rows.forEach((row) => {
          table += '<tr>' + row.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
        });
        table += '</tbody></table>';
        html.push(table);
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        closeList();
        html.push('<hr>');
        i += 1;
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = heading[1].length;
        html.push(`<h${level} id="${slugify(heading[2])}">${inline(heading[2])}</h${level}>`);
        i += 1;
        continue;
      }

      const ul = line.match(/^[-*]\s+(.+)$/);
      if (ul) {
        if (!inList || listTag !== 'ul') {
          closeList();
          html.push('<ul>');
          inList = true;
          listTag = 'ul';
        }
        html.push(`<li>${inline(ul[1])}</li>`);
        i += 1;
        continue;
      }

      const ol = line.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        if (!inList || listTag !== 'ol') {
          closeList();
          html.push('<ol>');
          inList = true;
          listTag = 'ol';
        }
        html.push(`<li>${inline(ol[1])}</li>`);
        i += 1;
        continue;
      }

      if (line.startsWith('> ')) {
        closeList();
        html.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
        i += 1;
        continue;
      }

      if (line.trim() === '') {
        closeList();
        i += 1;
        continue;
      }

      closeList();
      html.push(`<p>${inline(line)}</p>`);
      i += 1;
    }

    closeList();
    return html.join('\n');
  }

  return { markdownToHtml };
});
