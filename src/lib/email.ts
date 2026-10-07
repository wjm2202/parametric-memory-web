/**
 * Helpers for mail the website sends via Resend.
 *
 * Every value that came from a visitor (an email address, a name, a free-text
 * message) is untrusted. Before it goes into an email:
 *   - HTML bodies  → escapeHtml()        (stops markup / link injection)
 *   - headers      → toHeaderValue()     (stops CR/LF header injection and
 *                                         keeps subjects to a sane length)
 *
 * Sender + reply-to addresses live in src/config/site.ts
 * (TRANSACTIONAL_FROM, SUPPORT_EMAIL).
 */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape the five HTML-significant characters. Safe for text and attribute contexts. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Make an untrusted string safe for an email header such as Subject:
 * collapses all control characters (incl. CR/LF) and runs of whitespace to a
 * single space, trims, and truncates to `max` characters with an ellipsis.
 */
export function toHeaderValue(value: string, max = 120): string {
  const flat = value.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
