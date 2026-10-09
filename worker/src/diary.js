import { markdownToEditorHtml } from '../../shared/dust-wave-platform/packages/admin-shell/src/editor-codec.js';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Only these attribute-free formatting tags can enter an email excerpt. Count
// visible characters, keeping entities and closing tags intact at the boundary.
export function sanitizeDiaryExcerpt(html, maxLength = 200) {
  const tokens = String(html || '').match(/<\/?(?:strong|em|u)>|&(?:amp|lt|gt|quot|#39);|[\s\S]/gu) || [];
  const stack = [];
  let text = '', output = '', truncated = false;
  for (const token of tokens) {
    if (/^<\//.test(token)) {
      const tag = token.slice(2, -1);
      if (stack[stack.length - 1] === tag) { stack.pop(); output += token; }
    } else if (/^<(strong|em|u)>$/.test(token)) {
      stack.push(token.slice(1, -1));
      output += token;
    } else {
      const character = ENTITIES[token] || token;
      if (/\s/u.test(character) && (!text || /\s$/u.test(text))) continue;
      if (Array.from(text).length >= maxLength) { truncated = true; break; }
      text += /\s/u.test(character) ? ' ' : character;
      output += escapeText(/\s/u.test(character) ? ' ' : character);
    }
  }
  output += stack.reverse().map(tag => `</${tag}>`).join('');
  return { text: text.trimEnd() + (truncated ? '…' : ''), html: output.trimEnd() + (truncated ? '…' : '') };
}

export function buildDiaryExcerpt(entry = {}, maxLength = 200) {
  const source = typeof entry.body === 'string' && entry.body
    ? entry.body
    : (Array.isArray(entry.content) ? entry.content : []).map(block =>
      block.type === 'text' ? block.body || '' : block.type === 'quote' ? `"${block.text || ''}"` : ''
    ).filter(Boolean).join('\n\n');
  const html = markdownToEditorHtml(source.replace(/!\[[^\]]*\]\([^)]*\)/g, ''), {
    blockMode: true, allowHeadings: true, allowLists: true, allowLinks: true,
    discardUnsafeLinks: true
  }).replace(/<\/?(?:p|h[1-6]|ul|ol|li)>|<br\s*\/?>/gi, ' ')
    .replace(/<\/?a\b[^>]*>/gi, '')
    .replace(/<(\/?)b>/gi, '<$1strong>').replace(/<(\/?)i>/gi, '<$1em>');
  return sanitizeDiaryExcerpt(html, maxLength);
}

export function getDiaryExcerpt(entry, maxLength = 200) {
  return buildDiaryExcerpt(entry, maxLength).text;
}
