import { renderToStaticMarkup } from "react-dom/server";
import { MuvAiMarkdown } from "../components/muv-ai/muv-ai-markdown";

/**
 * MUV AI — permanent verification for Production Rollout v1.0, Stage 7
 * (Streaming and Storefront Experience): the controlled Markdown subset
 * used to render the assistant's own replies.
 *
 * Renders real React output via `renderToStaticMarkup` (no DOM/jsdom
 * needed) — this project's Vitest suite is documented as broken in this
 * environment (test-setup.ts's database-name derivation doesn't match
 * this environment's real database), so this follows the same
 * `scripts/verify-*.ts` convention as every other permanent suite
 * instead, per CLAUDE.md's own guidance.
 *
 * Run: `npx tsx scripts/verify-muv-ai-markdown.ts` (or
 * `npm run verify:muv-ai-markdown`).
 */

let passed = 0;
let failed = 0;
const check = (condition: boolean, name: string, extra?: unknown) => {
  if (condition) {
    passed++;
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
};

function render(text: string): string {
  return renderToStaticMarkup(MuvAiMarkdown({ text }));
}

function main() {
  check(render("Hello there").includes("<p>Hello there</p>"), "paragraphs: plain text renders inside a single <p>");

  const bold = render("We have **MUV Cloud Walk Floor Cleaner** in stock.");
  check(bold.includes("<strong>MUV Cloud Walk Floor Cleaner</strong>"), "bold: **text** renders as a real <strong> element", bold);

  const italic = render("This is *lightly* scented.");
  check(italic.includes("<em>lightly</em>"), "italics: *text* renders as a real <em> element", italic);

  const underscoreItalic = render("This is _lightly_ scented.");
  check(underscoreItalic.includes("<em>lightly</em>"), "italics: _text_ (underscore form) also renders as <em>");

  const list = render("Options:\n- Floor Cleaner\n- Bathroom Cleaner");
  check(list.includes("<ul") && list.includes("<li>Floor Cleaner</li>") && list.includes("<li>Bathroom Cleaner</li>"), "lists: '- item' lines render as real <ul><li> elements", list);

  const link = render("See [our floor cleaner](https://example.com/floor-cleaner) for details.");
  check(link.includes('href="https://example.com/floor-cleaner"') && link.includes('rel="noopener noreferrer"'), "links: [text](https://...) renders as a real, safely-attributed <a>", link);

  const jsLink = render("Click [here](javascript:alert(1)) now.");
  check(!jsLink.includes("<a"), "links: a javascript: URI is never turned into a real <a> — it's structurally excluded, not stripped after the fact", jsLink);

  const paragraphs = render("First paragraph.\n\nSecond paragraph.");
  check((paragraphs.match(/<p>/g) ?? []).length === 2, "paragraphs: a blank line starts a new <p>", paragraphs);

  // ---- The actual security property: no HTML injection surface exists at all ----
  const scriptAttempt = render("<script>alert(1)</script>");
  check(!scriptAttempt.includes("<script>alert(1)</script>") && scriptAttempt.includes("&lt;script&gt;"), "no HTML injection: a literal <script> tag in the text is escaped, never executed or rendered as a real element", scriptAttempt);

  const imgOnErrorAttempt = render('<img src=x onerror="alert(1)">');
  check(!imgOnErrorAttempt.includes("<img"), "no HTML injection: an <img onerror> attempt never becomes a real <img> element", imgOnErrorAttempt);

  const boldWithHtml = render("**<script>alert(1)</script>**");
  check(boldWithHtml.includes("<strong>") && !boldWithHtml.includes("<script>alert(1)</script>"), "no HTML injection: HTML embedded inside a bold span is still escaped text, not executed", boldWithHtml);

  console.log(`\nRESULT ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main();
