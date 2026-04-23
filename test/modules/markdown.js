import { escapeHtml, sanitizeHtml } from "./sanitize.js";

const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;
const LINK_PATTERN = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
const CODE_SPAN_PATTERN = /`([^`]+)`/g;

export function isMarkdownFile(file) {
    return MARKDOWN_FILE_PATTERN.test(file?.name || "") || file?.type === "text/markdown";
}

export function markdownToHtml(markdown) {
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraph = [];
    let blockquote = [];
    let list = null;
    let codeFence = null;

    const flushParagraph = () => {
        if (!paragraph.length) return;
        blocks.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
        paragraph = [];
    };

    const flushBlockquote = () => {
        if (!blockquote.length) return;
        blocks.push(`<blockquote><p>${blockquote.map(renderInline).join("<br>")}</p></blockquote>`);
        blockquote = [];
    };

    const flushList = () => {
        if (!list) return;
        const items = list.items.map((item) => `<li>${renderInline(item)}</li>`).join("");
        blocks.push(`<${list.type}>${items}</${list.type}>`);
        list = null;
    };

    const flushOpenBlocks = () => {
        flushParagraph();
        flushBlockquote();
        flushList();
    };

    for (const line of lines) {
        const fenceMatch = line.match(/^\s*```/);
        if (codeFence) {
            if (fenceMatch) {
                blocks.push(`<pre><code>${escapeHtml(codeFence.join("\n"))}</code></pre>`);
                codeFence = null;
            } else {
                codeFence.push(line);
            }
            continue;
        }

        if (fenceMatch) {
            flushOpenBlocks();
            codeFence = [];
            continue;
        }

        if (!line.trim()) {
            flushOpenBlocks();
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushOpenBlocks();
            const level = headingMatch[1].length;
            blocks.push(`<h${level}>${renderInline(headingMatch[2].trim())}</h${level}>`);
            continue;
        }

        if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
            flushOpenBlocks();
            blocks.push("<hr>");
            continue;
        }

        const quoteMatch = line.match(/^\s*>\s?(.*)$/);
        if (quoteMatch) {
            flushParagraph();
            flushList();
            blockquote.push(quoteMatch[1]);
            continue;
        }

        const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
        const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (unorderedMatch || orderedMatch) {
            flushParagraph();
            flushBlockquote();
            const type = unorderedMatch ? "ul" : "ol";
            if (list?.type !== type) flushList();
            if (!list) list = { type, items: [] };
            list.items.push((unorderedMatch || orderedMatch)[1]);
            continue;
        }

        flushBlockquote();
        flushList();
        paragraph.push(line);
    }

    if (codeFence) blocks.push(`<pre><code>${escapeHtml(codeFence.join("\n"))}</code></pre>`);
    flushOpenBlocks();
    return sanitizeHtml(blocks.join(""));
}

function renderInline(text) {
    const parts = [];
    let index = 0;

    String(text || "").replace(CODE_SPAN_PATTERN, (match, code, offset) => {
        appendTextWithLinks(parts, text.slice(index, offset));
        parts.push(`<code>${escapeHtml(code)}</code>`);
        index = offset + match.length;
        return match;
    });
    appendTextWithLinks(parts, text.slice(index));

    return parts.join("");
}

function appendTextWithLinks(parts, text) {
    let index = 0;
    String(text || "").replace(LINK_PATTERN, (match, label, href, title, offset) => {
        parts.push(renderFormattedText(text.slice(index, offset)));
        const safeHref = sanitizeMarkdownUrl(href);
        if (safeHref) {
            const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
            parts.push(`<a href="${escapeHtml(safeHref)}"${safeTitle}>${renderFormattedText(label)}</a>`);
        } else {
            parts.push(renderFormattedText(label));
        }
        index = offset + match.length;
        return match;
    });
    parts.push(renderFormattedText(text.slice(index)));
}

function renderFormattedText(text) {
    return escapeHtml(text)
        .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
        .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
        .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
}

function sanitizeMarkdownUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("#")) return trimmed;

    try {
        const parsed = new URL(trimmed, window.location.href);
        return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol) ? trimmed : "";
    } catch (error) {
        return "";
    }
}
