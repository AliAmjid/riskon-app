import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

export interface MarkdownSection {
  /** The `##` heading, or null for the title block above the first one. */
  heading: string | null;
  body: string;
}

/**
 * Split a report on `##` headings so the page can slip charts between
 * sections. The agent still writes markdown; the HTML is only a rendering.
 */
export function splitMarkdownSections(source: string): MarkdownSection[] {
  const trimmed = source.replace(/^\uFEFF/, '');
  if (!trimmed.trim()) return [];
  return trimmed
    .split(/^(?=##\s)/m)
    .map((body) => {
      const match = body.match(/^##\s+(.+?)\s*$/m);
      return { heading: match ? match[1].trim() : null, body };
    })
    .filter((section) => section.body.trim().length > 0);
}

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
