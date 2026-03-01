import { describe, it, expect } from "vitest";
import { htmlToMarkdown, cleanArticleText } from "../src/services/ingest-service.js";

describe("htmlToMarkdown", () => {
  it("should convert headings to atx style", () => {
    const html = "<h2>Section Title</h2><p>Content here.</p>";
    const md = htmlToMarkdown(html);
    expect(md).toContain("## Section Title");
    expect(md).toContain("Content here.");
  });

  it("should preserve paragraph structure", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    const md = htmlToMarkdown(html);
    expect(md).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("should remove figcaption elements", () => {
    const html =
      "<p>Article text.</p><figure><img src='x.jpg'><figcaption>Credit: Photographer</figcaption></figure>";
    const md = htmlToMarkdown(html);
    expect(md).not.toContain("Credit: Photographer");
    expect(md).toContain("Article text.");
  });

  it("should remove aside elements", () => {
    const html = "<p>Main content.</p><aside><p>Related articles</p></aside><p>More content.</p>";
    const md = htmlToMarkdown(html);
    expect(md).not.toContain("Related articles");
    expect(md).toContain("Main content.");
    expect(md).toContain("More content.");
  });

  it("should remove img tags", () => {
    const html = '<p>Text before.</p><img src="photo.jpg" alt="Photo"><p>Text after.</p>';
    const md = htmlToMarkdown(html);
    expect(md).not.toContain("photo.jpg");
    expect(md).not.toContain("Photo");
    expect(md).toContain("Text before.");
    expect(md).toContain("Text after.");
  });

  it("should preserve links", () => {
    const html = '<p>See <a href="https://example.com">this page</a> for details.</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("[this page](https://example.com)");
  });

  it("should normalize excessive whitespace", () => {
    const html = "<p>A</p>\n\n\n\n\n<p>B</p>";
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/\n{3,}/);
    expect(md).toContain("A");
    expect(md).toContain("B");
  });

  it("should handle empty HTML", () => {
    const md = htmlToMarkdown("");
    expect(md).toBe("");
  });

  it("should remove nav elements", () => {
    const html = "<p>Content.</p><nav><a href='/'>Home</a></nav>";
    const md = htmlToMarkdown(html);
    expect(md).not.toContain("Home");
    expect(md).toContain("Content.");
  });

  it("should remove elements with complementary role", () => {
    const html = '<p>Content.</p><div role="complementary"><p>Sidebar</p></div>';
    const md = htmlToMarkdown(html);
    expect(md).not.toContain("Sidebar");
    expect(md).toContain("Content.");
  });

  it("should remove figure elements (images with captions)", () => {
    const html =
      '<p>Article text.</p><figure><a href="https://example.com/img.jpg"><img src="img.jpg"></a><figcaption>Caption text. Credit: Author</figcaption></figure><p>More text.</p>';
    const md = htmlToMarkdown(html);
    expect(md).not.toContain("Caption text");
    expect(md).not.toContain("img.jpg");
    expect(md).toContain("Article text.");
    expect(md).toContain("More text.");
  });

  it("should remove empty markdown links", () => {
    const html =
      '<p>Text.</p><a href="https://example.com/photo.jpg"><img src="photo.jpg"></a><p>More.</p>';
    const md = htmlToMarkdown(html);
    expect(md).not.toContain("[](");
    expect(md).toContain("Text.");
    expect(md).toContain("More.");
  });

  it("should remove empty numbered list items", () => {
    const html = "<p>End of article.</p><ol><li></li></ol>";
    const md = htmlToMarkdown(html);
    expect(md).not.toMatch(/^\d+\.\s*$/m);
    expect(md).toContain("End of article.");
  });
});

describe("cleanArticleText", () => {
  // --- Duplicate paragraph removal ---

  it("should remove duplicate paragraphs", () => {
    const input = "First paragraph.\n\nSecond paragraph.\n\nFirst paragraph.";
    const result = cleanArticleText(input);
    expect(result).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("should preserve empty paragraph separators after normalization", () => {
    const input = "A\n\n\n\nB";
    const result = cleanArticleText(input);
    expect(result).toBe("A\n\nB");
  });

  it("should preserve all paragraphs when none are duplicated", () => {
    const input = "Alpha.\n\nBeta.\n\nGamma.";
    const result = cleanArticleText(input);
    expect(result).toBe("Alpha.\n\nBeta.\n\nGamma.");
  });

  // --- Credit line removal ---

  it("should remove trailing Credit from a line", () => {
    const input = "Caption text here. Credit: Valentina Palladino";
    const result = cleanArticleText(input);
    expect(result).toBe("Caption text here.");
  });

  it("should remove full Credit line", () => {
    const input = "Before.\n\nCredit: Andrew Cunningham\n\nAfter.";
    const result = cleanArticleText(input);
    expect(result).toBe("Before.\n\nAfter.");
  });

  it("should preserve lowercase 'credit' in normal text", () => {
    const input = "The team gave credit to their manager for the success.";
    const result = cleanArticleText(input);
    expect(result).toBe("The team gave credit to their manager for the success.");
  });

  // --- Comment link removal ---

  it("should remove Markdown comment links", () => {
    const input =
      'Article text.\n\n[80 Comments](https://example.com/article#comments "80 comments")';
    const result = cleanArticleText(input);
    expect(result).toBe("Article text.");
  });

  it("should remove plain text comment counts", () => {
    const input = "Article text.\n\n42 Comments";
    const result = cleanArticleText(input);
    expect(result).toBe("Article text.");
  });

  it("should handle singular Comment", () => {
    const input = "Article text.\n\n1 Comment";
    const result = cleanArticleText(input);
    expect(result).toBe("Article text.");
  });

  // --- Trailing author bio removal ---

  it("should remove trailing author bio when byline matches", () => {
    const bio =
      "Andrew is a Senior Technology Reporter at Ars Technica, covering smartphones, tablets, and wearables. He lives in Portland, Oregon.";
    const input = `First paragraph.\n\nSecond paragraph.\n\n${bio}`;
    const result = cleanArticleText(input, { byline: "Andrew Cunningham" });
    expect(result).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("should not remove bio when byline is null", () => {
    const bio =
      "Andrew is a Senior Technology Reporter at Ars Technica, covering smartphones and wearables.";
    const input = `First paragraph.\n\nSecond paragraph.\n\n${bio}`;
    const result = cleanArticleText(input, { byline: null });
    expect(result).toBe(input);
  });

  it("should not remove author-named paragraph in the middle of the article", () => {
    const bio =
      "Andrew is a Senior Technology Reporter at Ars Technica, covering smartphones.";
    const input = `First.\n\n${bio}\n\nThird.\n\nFourth.\n\nFifth.\n\nSixth.`;
    const result = cleanArticleText(input, { byline: "Andrew C" });
    expect(result).toBe(input);
  });

  it("should not remove paragraphs longer than 500 characters", () => {
    const longBio = `Andrew is a reporter who ${"writes about technology and ".repeat(20)}covers many topics.`;
    expect(longBio.length).toBeGreaterThan(500);
    const input = `First paragraph.\n\nSecond paragraph.\n\n${longBio}`;
    const result = cleanArticleText(input, { byline: "Andrew Smith" });
    expect(result).toBe(input);
  });

  it("should require at least 2 bio indicators to remove", () => {
    // Only 1 indicator ("covers") — should not be removed
    const input =
      "First paragraph.\n\nSecond paragraph.\n\nAndrew covers the latest tech trends in detail.";
    const result = cleanArticleText(input, { byline: "Andrew Smith" });
    expect(result).toBe(input);
  });

  // --- Leading metadata removal (Category C) ---

  it("should remove In Brief + Posted + timestamp", () => {
    const input =
      "In Brief\n\nPosted:\n\n2:07 PM PST · February 28, 2026\n\nArticle content here.";
    const result = cleanArticleText(input);
    expect(result).toBe("Article content here.");
  });

  it("should not remove 'In Brief' without timestamp anchor", () => {
    const input = "In Brief\n\nArticle content here.";
    const result = cleanArticleText(input);
    expect(result).toBe(input);
  });

  it("should remove standalone timestamp at the start", () => {
    const input = "2:07 PM PST · February 28, 2026\n\nArticle content here.";
    const result = cleanArticleText(input);
    expect(result).toBe("Article content here.");
  });

  // --- Event promotion block removal (Category A) ---

  it("should remove event promotion block (title + location|date)", () => {
    const input =
      "Content before.\n\nTechcrunch event\n\nBoston, MA | June 9, 2026\n\nContent after.";
    const result = cleanArticleText(input);
    expect(result).toBe("Content before.\n\nContent after.");
  });

  it("should remove event block with date range", () => {
    const input =
      "Content before.\n\nTechcrunch event\n\nSan Francisco, CA | October 13-15, 2026\n\nContent after.";
    const result = cleanArticleText(input);
    expect(result).toBe("Content before.\n\nContent after.");
  });

  it("should preserve long paragraphs before location|date", () => {
    const input =
      "Content about Boston, MA and its flourishing tech scene that discusses many interesting developments.\n\nMore content.";
    const result = cleanArticleText(input);
    expect(result).toBe(input);
  });

  it("should not remove paragraphs without location|date pattern", () => {
    const input = "Short text\n\nNormal paragraph with content.\n\nMore content.";
    const result = cleanArticleText(input);
    expect(result).toBe(input);
  });

  // --- Trailing navigation section removal (Category B) ---

  it("should remove trailing Newsletters + CTA + Related + Latest", () => {
    const input = [
      "Article content here.",
      "",
      "### Newsletters",
      "",
      "Subscribe for the industry's biggest tech news",
      "",
      "## Related",
      "",
      "## Latest in Media & Entertainment",
    ].join("\n");
    const result = cleanArticleText(input);
    expect(result).toBe("Article content here.");
  });

  it("should preserve '## Related Work' followed by substantial content", () => {
    const input =
      "Article content.\n\n## Related Work\n\nSmith et al. demonstrated that the approach is viable for large-scale systems.";
    const result = cleanArticleText(input);
    expect(result).toBe(input);
  });

  it("should remove trailing empty heading", () => {
    const input = "Content here.\n\n## Related";
    const result = cleanArticleText(input);
    expect(result).toBe("Content here.");
  });

  it("should not affect navigation headings in the middle of the article", () => {
    const input =
      "First section.\n\n## Related\n\nSmith et al. found interesting results.\n\nConclusion paragraph.";
    const result = cleanArticleText(input);
    expect(result).toBe(input);
  });

  it("should remove '## More from TechCrunch' at the end", () => {
    const input = "Content here.\n\n## More from TechCrunch";
    const result = cleanArticleText(input);
    expect(result).toBe("Content here.");
  });

  // --- Integration: full pipeline ---

  it("should handle combined noise in a single pass", () => {
    const input = [
      "Apple's 2018-era design. Credit: Valentina Palladino",
      "",
      "Apple's 2018-era design. Credit: Valentina Palladino",
      "",
      "Main article content here.",
      "",
      '[80 Comments](https://example.com#comments "80 comments")',
      "",
      "Andrew is a Senior Technology Reporter at Ars Technica, covering phones and tablets. He lives in Portland.",
    ].join("\n");

    const result = cleanArticleText(input, { byline: "Andrew Cunningham" });
    expect(result).toBe("Apple's 2018-era design.\n\nMain article content here.");
  });

  it("should handle all Phase 2 noise types combined", () => {
    const input = [
      "In Brief",
      "",
      "Posted:",
      "",
      "2:07 PM PST · February 28, 2026",
      "",
      "Main article content about the tech industry.",
      "",
      "Techcrunch event",
      "",
      "Boston, MA | June 9, 2026",
      "",
      "More article content with important details. Credit: Photographer",
      "",
      "### Newsletters",
      "",
      "Subscribe for the industry's biggest tech news",
      "",
      "## Related",
    ].join("\n");

    const result = cleanArticleText(input);
    expect(result).toBe(
      "Main article content about the tech industry.\n\nMore article content with important details.",
    );
  });
});
