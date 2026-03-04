// --- Content-level text cleanup ---

interface CleanArticleOptions {
  byline?: string | null;
}

// --- Leading metadata patterns (Category C) ---

// Anchor: timestamp line like "2:07 PM PST · February 28, 2026"
const TIMESTAMP_LINE =
  /^\d{1,2}:\d{2}\s*(?:AM|PM)\s+[A-Z]{2,4}\s*[·•]\s*\w+\s+\d{1,2},?\s*\d{4}\s*$/i;

// Metadata labels like "In Brief", "Posted:", "Updated:", "Published:"
const METADATA_LABELS = /^(?:in\s+brief|posted|updated|published)\s*:?\s*$/i;

// --- Event promotion patterns (Category A) ---

// "Boston, MA | June 9, 2026", "San Francisco, CA | October 13-15, 2026"
const EVENT_LOCATION_DATE =
  /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}\s*\|\s*\w+\s+\d{1,2}(?:[–-]\d{1,2})?,?\s*\d{4}\s*$/;

// --- Navigation heading patterns (Category B) ---

const NAVIGATION_HEADINGS: RegExp[] = [
  /^#{1,3}\s+newsletters?\s*$/i,
  /^#{1,3}\s+related\s*$/i,
  /^#{1,3}\s+latest\s+(in\s+)?/i,
  /^#{1,3}\s+more\s+(from|stories|in)\s+/i,
  /^#{1,3}\s+recommended\s*$/i,
  /^#{1,3}\s+trending\s*$/i,
  /^#{1,3}\s+popular\s*$/i,
  /^#{1,3}\s+subscribe\s*$/i,
];

const CONTACT_INFO_PATTERNS: RegExp[] = [
  // "You can contact Anthony Ha at..." / "reach out to..." / "send tips to..."
  /\b(?:contact|reach|verify\s+outreach|get\s+in\s+touch|send\s+(?:tips?|news))\b.*?\S+@\S+/i,
  // "[View Bio](https://...)" standalone link
  /^\[View (?:Bio|Profile)\]\([^)]*\)\s*$/i,
];

const AUTHOR_BIO_INDICATORS: RegExp[] = [
  /\bis an?\b/i,
  /\breporter\b/i,
  /\beditor\b/i,
  /\bwriter\b/i,
  /\bjournalist\b/i,
  /\bcorrespondent\b/i,
  /\bcolumnist\b/i,
  /\blives? in\b/i,
  /\bbased in\b/i,
  /\bcovers?\b/i,
  /\bwrites? about\b/i,
  /\bco-hosts?\b/i,
  /\bpodcast\b/i,
];

function removeDuplicateParagraphs(text: string): string {
  const paragraphs = text.split("\n\n");
  const seen = new Set<string>();
  const result: string[] = [];

  for (const para of paragraphs) {
    const normalized = para.trim();
    if (normalized === "") {
      result.push(para);
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(para);
    }
  }

  return result.join("\n\n");
}

function removeLeadingMetadata(text: string): string {
  const paragraphs = text.split("\n\n");

  // Scan first 5 paragraphs for a timestamp anchor
  const limit = Math.min(paragraphs.length, 5);
  let timestampIdx = -1;

  for (let i = 0; i < limit; i++) {
    if (TIMESTAMP_LINE.test(paragraphs[i].trim())) {
      timestampIdx = i;
      break;
    }
  }

  if (timestampIdx === -1) return text;

  // Mark timestamp for removal, then walk backwards to remove metadata labels
  const toRemove = new Set<number>([timestampIdx]);
  for (let i = timestampIdx - 1; i >= 0; i--) {
    const trimmed = paragraphs[i].trim();
    if (trimmed === "" || METADATA_LABELS.test(trimmed)) {
      toRemove.add(i);
    } else {
      break;
    }
  }

  return paragraphs.filter((_, idx) => !toRemove.has(idx)).join("\n\n");
}

function removeEventPromotionBlocks(text: string): string {
  const paragraphs = text.split("\n\n");
  const toRemove = new Set<number>();

  for (let i = 0; i < paragraphs.length; i++) {
    const trimmed = paragraphs[i].trim();

    if (EVENT_LOCATION_DATE.test(trimmed)) {
      // Always remove the location/date line
      toRemove.add(i);

      // Check if preceding paragraph is a short event title (≤80 chars, no sentence structure)
      if (i > 0) {
        const prev = paragraphs[i - 1].trim();
        if (prev.length > 0 && prev.length <= 80 && !prev.includes(". ")) {
          toRemove.add(i - 1);
        }
      }
    }
  }

  if (toRemove.size === 0) return text;
  return paragraphs.filter((_, idx) => !toRemove.has(idx)).join("\n\n");
}

function removeTrailingNavigationSections(text: string): string {
  const paragraphs = text.split("\n\n");
  let cutPoint = paragraphs.length;

  // Scan backwards from the end
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const trimmed = paragraphs[i].trim();

    // Empty paragraph — continue scanning
    if (trimmed === "") {
      cutPoint = i;
      continue;
    }

    // Navigation heading — mark for removal
    if (NAVIGATION_HEADINGS.some((re) => re.test(trimmed))) {
      cutPoint = i;
      continue;
    }

    // Short non-heading text within noise zone (≤100 chars, no sentence structure, no sentence-ending punctuation)
    if (
      cutPoint < paragraphs.length &&
      trimmed.length <= 100 &&
      !trimmed.includes(". ") &&
      !/[.!?]$/.test(trimmed)
    ) {
      cutPoint = i;
      continue;
    }

    // Substantial content reached — stop
    break;
  }

  if (cutPoint === paragraphs.length) return text;
  return paragraphs.slice(0, cutPoint).join("\n\n");
}

function removeTrailingAuthorBio(text: string, byline: string | null): string {
  if (!byline) return text;

  const firstName = byline.trim().split(/\s+/)[0];
  if (!firstName || firstName.length < 2) return text;

  const paragraphs = text.split("\n\n");
  if (paragraphs.length === 0) return text;

  // Only check the last 3 paragraphs
  const startIdx = Math.max(0, paragraphs.length - 3);

  for (let i = paragraphs.length - 1; i >= startIdx; i--) {
    const para = paragraphs[i].trim();
    if (para.length === 0 || para.length > 500) continue;

    if (!para.startsWith(firstName)) continue;

    const matchCount = AUTHOR_BIO_INDICATORS.reduce(
      (count, re) => count + (re.test(para) ? 1 : 0),
      0,
    );

    if (matchCount >= 2) {
      paragraphs.splice(i, 1);
      break; // Remove at most one bio paragraph
    }
  }

  return paragraphs.join("\n\n");
}

function removeTrailingContactInfo(text: string): string {
  const paragraphs = text.split("\n\n");
  const startIdx = Math.max(0, paragraphs.length - 3);

  for (let i = paragraphs.length - 1; i >= startIdx; i--) {
    const para = paragraphs[i].trim();
    if (para.length === 0) continue;
    if (para.length > 200) continue;

    if (CONTACT_INFO_PATTERNS.some((re) => re.test(para))) {
      paragraphs.splice(i, 1);
      // Don't break — contact line + View Bio may be consecutive
    }
  }

  return paragraphs.join("\n\n");
}

export function cleanArticleText(text: string, options: CleanArticleOptions = {}): string {
  let cleaned = text;

  // 1. Remove leading article metadata (timestamps, "In Brief")
  cleaned = removeLeadingMetadata(cleaned);

  // 2. Remove duplicate paragraphs (e.g., caption text duplicated outside <figure>)
  cleaned = removeDuplicateParagraphs(cleaned);

  // 3. Remove inline event/conference promotion blocks
  cleaned = removeEventPromotionBlocks(cleaned);

  // 4. Remove trailing navigation sections
  cleaned = removeTrailingNavigationSections(cleaned);

  // 5. Remove Credit lines — both full-line and inline trailing
  cleaned = cleaned.replace(/[ \t]*\bCredit:\s+.+$/gm, "").replace(/^\s+$/gm, "");

  // 6. Remove comment links (Markdown and plain text forms)
  cleaned = cleaned
    .replace(/\[\d+\s+Comments?\]\(.*?\)/g, "")
    .replace(/^\d+\s+Comments?\s*$/gm, "");

  // 7. Remove trailing author bio
  cleaned = removeTrailingAuthorBio(cleaned, options.byline ?? null);

  // 8. Remove trailing contact info (e.g., "You can contact..." + "[View Bio]")
  cleaned = removeTrailingContactInfo(cleaned);

  // 9. Final whitespace normalization
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}
