import React from "react";

/**
 * Renders simple markdown body text with support for:
 * - Paragraphs (double newline separated)
 * - Headers (### / ## / #)
 * - Bold (**text**)
 * - Italic (*text*)
 * - Bullet lists (- item)
 * - Numbered lists (1. item)
 */
export default function MarkdownBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);

  return (
    <div className="text-xs text-foreground/80 leading-relaxed space-y-3">
      {blocks.map((block, bi) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Header
        if (trimmed.startsWith("### ")) {
          return <h4 key={bi} className="text-xs font-bold text-foreground mt-2">{renderInline(trimmed.slice(4))}</h4>;
        }
        if (trimmed.startsWith("## ")) {
          return <h3 key={bi} className="text-sm font-bold text-foreground mt-2">{renderInline(trimmed.slice(3))}</h3>;
        }
        if (trimmed.startsWith("# ")) {
          return <h2 key={bi} className="text-sm font-bold text-foreground mt-3">{renderInline(trimmed.slice(2))}</h2>;
        }

        // Bullet or numbered list
        const lines = trimmed.split("\n");
        const isList = lines.every(l => /^[-•]\s/.test(l.trim()) || l.trim() === "");
        const isNumbered = lines.every(l => /^\d+\.\s/.test(l.trim()) || l.trim() === "");

        if (isList) {
          return (
            <ul key={bi} className="list-disc list-inside space-y-1 pl-1">
              {lines.filter(l => l.trim()).map((l, li) => (
                <li key={li} className="text-xs text-foreground/80">{renderInline(l.replace(/^[-•]\s*/, ""))}</li>
              ))}
            </ul>
          );
        }

        if (isNumbered) {
          return (
            <ol key={bi} className="list-decimal list-inside space-y-1 pl-1">
              {lines.filter(l => l.trim()).map((l, li) => (
                <li key={li} className="text-xs text-foreground/80">{renderInline(l.replace(/^\d+\.\s*/, ""))}</li>
              ))}
            </ol>
          );
        }

        // Regular paragraph (may have single line breaks)
        return (
          <p key={bi}>
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Render inline bold and italic */
function renderInline(text: string): React.ReactNode {
  // Split on **bold** and *italic* patterns
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      parts.push(<strong key={match.index} className="font-semibold text-foreground">{match[2]}</strong>);
    } else if (match[3]) {
      // Italic
      parts.push(<em key={match.index}>{match[3]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}
