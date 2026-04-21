const ALLOWED_TAGS = new Set([
    "B",
    "BLOCKQUOTE",
    "BR",
    "CODE",
    "COL",
    "COLGROUP",
    "A",
    "CAPTION",
    "DIV",
    "EM",
    "FONT",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HR",
    "I",
    "LI",
    "OL",
    "P",
    "PRE",
    "S",
    "SPAN",
    "STRIKE",
    "STRONG",
    "SUB",
    "SUP",
    "TABLE",
    "TBODY",
    "TD",
    "TFOOT",
    "TH",
    "THEAD",
    "TR",
    "U",
    "UL",
]);

const DROP_WITH_CONTENT_TAGS = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE", "TEMPLATE"]);
const ALLOWED_STYLE_PROPERTIES = [
    "background-color",
    "border",
    "border-bottom",
    "border-collapse",
    "border-color",
    "border-left",
    "border-right",
    "border-spacing",
    "border-style",
    "border-top",
    "border-width",
    "color",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "height",
    "letter-spacing",
    "line-height",
    "margin-left",
    "margin-right",
    "padding",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "padding-top",
    "text-align",
    "text-decoration",
    "text-decoration-line",
    "text-indent",
    "vertical-align",
    "white-space",
    "width",
];

const UNSAFE_STYLE_VALUE = /(?:expression\s*\(|url\s*\(|javascript:|vbscript:|data:|@import|behavior\s*:|[<>])/i;
const UNSAFE_STYLE_ATTRIBUTE_VALUE = /(?:expression\s*\(|url\s*\(|javascript:|vbscript:|data:|@import|behavior\s*:|[<>{};])/i;
const FONT_SIZE_MAP = new Map([
    [1, "10px"],
    [2, "13px"],
    [3, "16px"],
    [4, "18px"],
    [5, "24px"],
    [6, "32px"],
    [7, "48px"],
]);

export function sanitizeHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const classStyles = collectClassStyles(template.content);
    sanitizeChildren(template.content, classStyles);
    return template.innerHTML;
}

export function toSafeText(value) {
    return String(value || "");
}

export function escapeHtml(value) {
    return toSafeText(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function sanitizeLibrary(library) {
    if (!Array.isArray(library)) return [];

    return library.map((novel) => ({
        ...novel,
        title: toSafeText(novel.title),
        memo: toSafeText(novel.memo),
        password: novel.password && !novel.passwordLock ? toSafeText(novel.password) : undefined,
        passwordLock: sanitizePasswordLock(novel.passwordLock),
        chapters: Array.isArray(novel.chapters)
            ? novel.chapters.map((chapter) => ({
                ...chapter,
                title: toSafeText(chapter.title),
                content: sanitizeHtml(chapter.content),
            }))
            : [],
    }));
}

function sanitizePasswordLock(lock) {
    if (!lock?.hash || !lock?.salt) return undefined;

    return {
        version: Number(lock.version) || 1,
        algorithm: toSafeText(lock.algorithm || "SHA-256"),
        salt: toSafeText(lock.salt),
        hash: toSafeText(lock.hash),
    };
}

export function sanitizeCharacters(characters) {
    if (!Array.isArray(characters)) return [];

    return characters.map((character) => ({
        ...character,
        name: toSafeText(character.name),
        age: toSafeText(character.age),
        role: toSafeText(character.role),
        appearance: toSafeText(character.appearance),
        personality: toSafeText(character.personality),
    }));
}

function collectClassStyles(root) {
    const classStyles = new Map();
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;

    for (const styleElement of root.querySelectorAll("style")) {
        const styleText = styleElement.textContent || "";
        let rule;

        while ((rule = rulePattern.exec(styleText))) {
            const safeStyle = sanitizeStyle(rule[2]);
            if (!safeStyle) continue;

            for (const selector of rule[1].split(",")) {
                const classMatches = selector.matchAll(/\.([_a-zA-Z][\w-]*)/g);
                for (const classMatch of classMatches) {
                    const className = classMatch[1];
                    const existingStyle = classStyles.get(className);
                    classStyles.set(className, existingStyle ? `${existingStyle}; ${safeStyle}` : safeStyle);
                }
            }
        }
    }

    return classStyles;
}

function sanitizeChildren(parent, classStyles) {
    for (const child of [...parent.childNodes]) {
        sanitizeNode(child, classStyles);
    }
}

function sanitizeNode(node, classStyles) {
    if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tagName = node.tagName;
    if (DROP_WITH_CONTENT_TAGS.has(tagName)) {
        node.remove();
        return;
    }

    sanitizeChildren(node, classStyles);

    if (!ALLOWED_TAGS.has(tagName)) {
        node.replaceWith(...node.childNodes);
        return;
    }

    sanitizeAttributes(node, classStyles);
}

function sanitizeAttributes(node, classStyles) {
    const originalAttributes = new Map([...node.attributes].map((attribute) => [attribute.name.toLowerCase(), attribute.value]));
    const styleParts = [];
    appendClassStyles(styleParts, originalAttributes.get("class"), classStyles);
    appendPresentationAttributeStyles(styleParts, node, originalAttributes);
    if (node.tagName === "FONT") appendFontAttributeStyles(styleParts, originalAttributes);
    styleParts.push(originalAttributes.get("style") || "");

    for (const attribute of [...node.attributes]) {
        node.removeAttribute(attribute.name);
    }

    const safeStyle = sanitizeStyle(styleParts.filter(Boolean).join("; "));
    if (safeStyle) node.setAttribute("style", safeStyle);

    restoreSafeAttributes(node, originalAttributes);
}

function appendClassStyles(styleParts, classNames, classStyles) {
    for (const className of String(classNames || "").split(/\s+/).filter(Boolean)) {
        const classStyle = classStyles.get(className);
        if (classStyle) styleParts.push(classStyle);
    }
}

function appendPresentationAttributeStyles(styleParts, node, attributes) {
    const align = attributes.get("align");
    if (["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH"].includes(node.tagName)) {
        appendMatchingStyle(styleParts, "text-align", align, /^(left|right|center|justify)$/i);
    }

    const verticalAlign = attributes.get("valign");
    if (["TD", "TH", "TR"].includes(node.tagName)) {
        appendMatchingStyle(styleParts, "vertical-align", verticalAlign, /^(top|middle|bottom|baseline)$/i);
    }

    if (["TABLE", "TBODY", "TFOOT", "THEAD", "TR", "TD", "TH"].includes(node.tagName)) {
        appendSafeStyle(styleParts, "background-color", attributes.get("bgcolor"));
    }

    if (["TABLE", "TD", "TH", "COL", "COLGROUP"].includes(node.tagName)) {
        appendLengthStyle(styleParts, "width", attributes.get("width"));
    }

    if (["TABLE", "TD", "TH"].includes(node.tagName)) {
        appendLengthStyle(styleParts, "height", attributes.get("height"));
    }

    if (["TABLE", "TD", "TH"].includes(node.tagName)) {
        const border = normalizeCssLength(attributes.get("border"));
        if (border && border !== "0px") styleParts.push(`border: ${border} solid currentColor`);
    }

    if (node.tagName === "TABLE") {
        appendLengthStyle(styleParts, "border-spacing", attributes.get("cellspacing"));
    }
}

function sanitizeStyle(styleText) {
    if (!styleText) return "";

    const parser = document.createElement("span");
    parser.setAttribute("style", styleText);

    return ALLOWED_STYLE_PROPERTIES.map((property) => {
        const value = parser.style.getPropertyValue(property).trim();
        if (!value || UNSAFE_STYLE_VALUE.test(value)) return "";

        const priority = parser.style.getPropertyPriority(property);
        return `${property}: ${value}${priority ? ` !${priority}` : ""}`;
    }).filter(Boolean).join("; ");
}

function appendFontAttributeStyles(styleParts, attributes) {
    const color = attributes.get("color");
    if (isSafeStyleAttributeValue(color)) styleParts.push(`color: ${color}`);

    const face = attributes.get("face");
    if (isSafeStyleAttributeValue(face)) styleParts.push(`font-family: ${face}`);

    const size = sanitizeFontSize(attributes.get("size"));
    if (size) styleParts.push(`font-size: ${size}`);
}

function restoreSafeAttributes(node, attributes) {
    if (node.tagName === "A") {
        const href = sanitizeUrl(attributes.get("href"));
        if (href) node.setAttribute("href", href);

        const title = attributes.get("title");
        if (title) node.setAttribute("title", title);
    }

    if (node.tagName === "OL") {
        setPositiveIntegerAttribute(node, "start", attributes.get("start"));
        setMatchingAttribute(node, "type", attributes.get("type"), /^(1|a|A|i|I)$/);
    }

    if (node.tagName === "UL") {
        setMatchingAttribute(node, "type", attributes.get("type"), /^(disc|circle|square)$/i);
    }

    if (node.tagName === "LI") {
        setPositiveIntegerAttribute(node, "value", attributes.get("value"));
    }

    if (["TD", "TH"].includes(node.tagName)) {
        setPositiveIntegerAttribute(node, "colspan", attributes.get("colspan"));
        setPositiveIntegerAttribute(node, "rowspan", attributes.get("rowspan"));
    }

    if (node.tagName === "TABLE") {
        setPositiveIntegerAttribute(node, "border", attributes.get("border"));
        setPositiveIntegerAttribute(node, "cellpadding", attributes.get("cellpadding"));
        setPositiveIntegerAttribute(node, "cellspacing", attributes.get("cellspacing"));
    }

    if (["COL", "COLGROUP"].includes(node.tagName)) {
        setPositiveIntegerAttribute(node, "span", attributes.get("span"));
    }
}

function sanitizeUrl(value) {
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

function sanitizeFontSize(value) {
    const normalized = String(value || "").trim();
    if (!/^[+-]?\d+$/.test(normalized)) return "";

    const size = normalized.startsWith("+") || normalized.startsWith("-")
        ? 3 + Number.parseInt(normalized, 10)
        : Number.parseInt(normalized, 10);
    return FONT_SIZE_MAP.get(Math.min(Math.max(size, 1), 7)) || "";
}

function isSafeStyleAttributeValue(value) {
    return Boolean(value) && !UNSAFE_STYLE_ATTRIBUTE_VALUE.test(value);
}

function appendSafeStyle(styleParts, property, value) {
    if (isSafeStyleAttributeValue(value)) styleParts.push(`${property}: ${value}`);
}

function appendMatchingStyle(styleParts, property, value, pattern) {
    const normalized = String(value || "").trim();
    if (pattern.test(normalized)) styleParts.push(`${property}: ${normalized}`);
}

function appendLengthStyle(styleParts, property, value) {
    const length = normalizeCssLength(value);
    if (length) styleParts.push(`${property}: ${length}`);
}

function normalizeCssLength(value) {
    const normalized = String(value || "").trim();
    if (!/^\d+(?:\.\d+)?(?:%|px|pt|em|rem)?$/i.test(normalized)) return "";
    return /^\d+(?:\.\d+)?$/.test(normalized) ? `${normalized}px` : normalized;
}

function setPositiveIntegerAttribute(node, name, value) {
    const normalized = String(value || "").trim();
    if (/^\d+$/.test(normalized) && Number.parseInt(normalized, 10) > 0) {
        node.setAttribute(name, normalized);
    }
}

function setMatchingAttribute(node, name, value, pattern) {
    const normalized = String(value || "").trim();
    if (pattern.test(normalized)) node.setAttribute(name, normalized);
}
