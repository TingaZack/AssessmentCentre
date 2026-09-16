// src/utils/quillUtils.ts

/**
 * Ensures rich text content from react-quill-new is properly formatted HTML.
 * Handles null/undefined guards and converts plain-text string linebreaks into HTML paragraphs.
 */
export const formatQuillHtml = (content?: string | null): string => {
  if (!content || typeof content !== "string") {
    return "";
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  // Check if the string already contains HTML tags
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(trimmed);

  if (hasHtmlTags) {
    return trimmed;
  }

  // Convert plain text with newlines into standard Quill <p> tags
  return trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br/>")}</p>`)
    .join("");
};
