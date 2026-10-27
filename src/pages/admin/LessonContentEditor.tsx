
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

type LessonContentEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
};

type Tool = {
  label: string;
  title: string;
  before: string;
  after: string;
  sample?: string;
};

const tools: Tool[] = [
  {
    label: "H1",
    title: "Large heading",
    before: "# ",
    after: "",
    sample: "Section heading",
  },
  {
    label: "H2",
    title: "Subheading",
    before: "## ",
    after: "",
    sample: "Subheading",
  },
  {
    label: "B",
    title: "Bold",
    before: "**",
    after: "**",
    sample: "important text",
  },
  {
    label: "I",
    title: "Italic",
    before: "*",
    after: "*",
    sample: "emphasized text",
  },
  {
    label: "• List",
    title: "Bulleted list",
    before: "- ",
    after: "",
    sample: "List item",
  },
  {
    label: "1. List",
    title: "Numbered list",
    before: "1. ",
    after: "",
    sample: "List item",
  },
  {
    label: "Quote",
    title: "Note or quotation",
    before: "> ",
    after: "",
    sample: "Important note",
  },
  {
    label: "Code",
    title: "Code or plain-text formula",
    before: "\n```\n",
    after: "\n```",
    sample: "your content",
  },
  {
    label: "Inline math",
    title: "Inline mathematical expression",
    before: "$",
    after: "$",
    sample: "E = mc^2",
  },
  {
    label: "Equation",
    title: "Displayed mathematical equation",
    before: "\n$$\n",
    after: "\n$$",
    sample: "E = mc^2",
  },
];

const tableTemplate = [
  "| Heading 1 | Heading 2 |",
  "| --- | --- |",
  "| Value 1 | Value 2 |",
].join("\n");

export default function LessonContentEditor({
  label,
  value,
  onChange,
  placeholder = "Write or paste your lesson content here...",
  minRows = 8,
}: LessonContentEditorProps) {
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertFormatting(tool: Tool) {
    const textarea = textareaRef.current;

    if (!textarea) {
      onChange(
        value + "\n" + tool.before + (tool.sample ?? "") + tool.after
      );
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const text = selected || tool.sample || "";
    const replacement = tool.before + text + tool.after;

    const nextValue =
      value.slice(0, start) + replacement + value.slice(end);

    onChange(nextValue);

    requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (!current) return;

      current.focus();

      if (selected) {
        current.setSelectionRange(
          start + replacement.length,
          start + replacement.length
        );
      } else {
        const cursor = start + tool.before.length + text.length;
        current.setSelectionRange(cursor, cursor);
      }
    });
  }

  function insertTable() {
    const textarea = textareaRef.current;

    if (!textarea) {
      onChange(value + "\n\n" + tableTemplate + "\n");
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const insertion = "\n" + tableTemplate + "\n";

    const nextValue =
      value.slice(0, start) + insertion + value.slice(end);

    onChange(nextValue);

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const cursor = start + insertion.length;
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <section className="lesson-content-editor">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <label
          style={{
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {label}
        </label>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setPreview(false)}
            aria-pressed={!preview}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid var(--border, #444)",
              background: !preview
                ? "var(--accent, #536dfe)"
                : "transparent",
              color: !preview ? "#fff" : "inherit",
              cursor: "pointer",
            }}
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => setPreview(true)}
            aria-pressed={preview}
            style={{
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid var(--border, #444)",
              background: preview
                ? "var(--accent, #536dfe)"
                : "transparent",
              color: preview ? "#fff" : "inherit",
              cursor: "pointer",
            }}
          >
            Preview
          </button>
        </div>
      </div>

      {!preview && (
        <>
          <div
            role="toolbar"
            aria-label={`${label} formatting tools`}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: 10,
              border: "1px solid var(--border, #444)",
              borderBottom: 0,
              borderRadius: "10px 10px 0 0",
            }}
          >
            {tools.map((tool) => (
              <button
                key={tool.label}
                type="button"
                title={tool.title}
                onClick={() => insertFormatting(tool)}
                style={{
                  padding: "6px 9px",
                  border: "1px solid var(--border, #444)",
                  borderRadius: 6,
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {tool.label}
              </button>
            ))}

            <button
              type="button"
              title="Insert a table"
              onClick={insertTable}
              style={{
                padding: "6px 9px",
                border: "1px solid var(--border, #444)",
                borderRadius: 6,
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Table
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            rows={minRows}
            spellCheck
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              padding: 14,
              resize: "vertical",
              border: "1px solid var(--border, #444)",
              borderRadius: "0 0 10px 10px",
              background: "var(--input-bg, transparent)",
              color: "inherit",
              font: "inherit",
              lineHeight: 1.7,
            }}
          />

          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 7 }}>
            Select text before using a formatting tool, or click a tool
            to insert a sample. Tables use Markdown syntax.
          </p>
        </>
      )}

      {preview && (
        <div
          className="lesson-markdown"
          style={{
            padding: 18,
            border: "1px solid var(--border, #444)",
            borderRadius: 10,
            minHeight: 120,
            overflowX: "auto",
            lineHeight: 1.8,
            overflowWrap: "anywhere",
          }}
        >
          {value.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                h1: ({ children }) => (
                  <h1 style={{ fontSize: "1.8em", lineHeight: 1.3 }}>
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 style={{ fontSize: "1.45em", lineHeight: 1.4 }}>
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 style={{ fontSize: "1.2em", lineHeight: 1.5 }}>
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p style={{ margin: "0.8em 0" }}>{children}</p>
                ),
                ul: ({ children }) => (
                  <ul style={{ paddingLeft: 24, listStyleType: "disc" }}>
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol style={{ paddingLeft: 24 }}>{children}</ol>
                ),
                blockquote: ({ children }) => (
                  <blockquote
                    style={{
                      margin: "16px 0",
                      padding: "10px 14px",
                      borderLeft: "4px solid var(--accent, #536dfe)",
                      background: "var(--surface, rgba(127,127,127,0.08))",
                    }}
                  >
                    {children}
                  </blockquote>
                ),
                table: ({ children }) => (
                  <div style={{ overflowX: "auto", margin: "16px 0" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 320,
                      }}
                    >
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th
                    style={{
                      textAlign: "left",
                      padding: 10,
                      border: "1px solid var(--border, #666)",
                      background: "var(--surface, rgba(127,127,127,0.12))",
                    }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td
                    style={{
                      padding: 10,
                      border: "1px solid var(--border, #666)",
                    }}
                  >
                    {children}
                  </td>
                ),
                pre: ({ children }) => (
                  <pre
                    style={{
                      padding: 12,
                      overflowX: "auto",
                      borderRadius: 8,
                      background: "var(--surface, rgba(127,127,127,0.1))",
                    }}
                  >
                    {children}
                  </pre>
                ),
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <p style={{ opacity: 0.65 }}>
              Your formatted lesson preview will appear here.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
