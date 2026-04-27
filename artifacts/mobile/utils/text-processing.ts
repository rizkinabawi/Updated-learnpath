/**
 * text-processing.ts
 * Shared logic for cleaning and formatting OCR/AI text.
 */

export const cleanText = (text: string): string => {
  if (!text) return "";
  
  return text
    // 1. Normalize whitespace
    .replace(/\s+/g, " ")
    // 2. Normalize smart/curly quotes
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    // 3. Remove invisible characters
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
    // 4. Normalize line endings
    .replace(/\r\n/g, "\n")
    .trim();
};

/**
 * Extracts and cleans Japanese text if present, 
 * or prepares text for flashcard consumption.
 */
export const prepareForFlashcard = (text: string) => {
  const cleaned = cleanText(text);
  // Optional: add logic for auto-splitting or romaji conversion here
  return cleaned;
};
