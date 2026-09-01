import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Render the agent's report to HTML.
 *
 * The markdown is written by an agent working over data the stakeholder
 * uploaded, so it is not trusted input: sanitise before it reaches the DOM.
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'a', 'span',
    ],
    ALLOWED_ATTR: ['href', 'title', 'align'],
    // Anything else the agent emits — an image, an iframe — is dropped rather
    // than fetched from wherever it points.
    ALLOW_DATA_ATTR: false,
  });
}
