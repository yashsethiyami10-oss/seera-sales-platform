import type { ReactNode } from "react";

/**
 * MUV AI — Production Rollout v1.0, Stage 7 (Streaming and Storefront
 * Experience). A controlled Markdown subset for the assistant's own
 * replies — paragraphs, bold, italics, lists, links (http/https only).
 *
 * Deliberately never touches `dangerouslySetInnerHTML` or any HTML
 * string parsing at all — every node below is built directly as JSX, so
 * there is no HTML-injection surface to sanitize in the first place, not
 * "sanitized after the fact." A customer message, a product description,
 * or a future upload containing `<script>`/`<img onerror>` etc. is
 * always treated as literal text by React's own escaping, exactly as it
 * already was before this component existed — this only adds a small,
 * fixed inline/block grammar on top of that same safe foundation, never
 * a way to inject real HTML.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
  const BOLD_RE = /\*\*([^*]+)\*\*/;
  const ITALIC_RE = /\*([^*]+)\*|_([^_]+)_/;

  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const linkMatch = remaining.match(LINK_RE);
    const boldMatch = remaining.match(BOLD_RE);
    const italicMatch = remaining.match(ITALIC_RE);
    const candidates = [linkMatch, boldMatch, italicMatch].filter((m): m is RegExpMatchArray => m !== null && m.index !== undefined);

    if (candidates.length === 0) {
      nodes.push(remaining);
      break;
    }
    const earliest = candidates.reduce((a, b) => (a.index! <= b.index! ? a : b));
    const before = remaining.slice(0, earliest.index!);
    if (before) nodes.push(before);

    if (earliest === linkMatch) {
      nodes.push(
        <a key={`${keyPrefix}-${key++}`} href={linkMatch![2]} target="_blank" rel="noopener noreferrer">
          {linkMatch![1]}
        </a>
      );
    } else if (earliest === boldMatch) {
      nodes.push(<strong key={`${keyPrefix}-${key++}`}>{boldMatch![1]}</strong>);
    } else {
      nodes.push(<em key={`${keyPrefix}-${key++}`}>{italicMatch![1] ?? italicMatch![2] ?? ""}</em>);
    }
    remaining = remaining.slice(earliest.index! + earliest[0].length);
  }
  return nodes;
}

export function MuvAiMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let paraBuffer: string[] = [];
  let blockKey = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    listBuffer = [];
    blocks.push(
      <ul key={`list-${blockKey++}`} className="muv-ai-markdown-list">
        {items.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blockKey}-${i}`)}</li>
        ))}
      </ul>
    );
  };
  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    const content = paraBuffer.join(" ");
    paraBuffer = [];
    blocks.push(<p key={`p-${blockKey++}`}>{renderInline(content, `p-${blockKey}`)}</p>);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushPara();
      flushList();
      continue;
    }
    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushPara();
      listBuffer.push(listMatch[1]!);
    } else {
      flushList();
      paraBuffer.push(line);
    }
  }
  flushPara();
  flushList();

  return <>{blocks}</>;
}
