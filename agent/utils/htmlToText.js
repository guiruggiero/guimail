// Imports
import sanitizeHtml from "sanitize-html";

// Converts an HTML email body into plain text, keeping line breaks
export const htmlToText = (html) => {
  if (!html) return "";

  // Turn line and block ends into newlines before tags are stripped
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n");

  // Remove all tags and attributes; style/script content is dropped by default
  const text = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  });

  // sanitize-html escapes text, so decode the entities it leaves
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&") // Last, to avoid double-decoding
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
