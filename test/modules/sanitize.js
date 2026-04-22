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
const CLIPBOARD_BLOCKED_STYLE_PROPERTIES = new Set([
    "background-color",
    "font-family",
    "height",
    "margin-left",
    "margin-right",
    "padding",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "padding-top",
    "text-indent",
    "width",
]);
const CLIPBOARD_ALLOWED_STYLE_PROPERTIES = ALLOWED_STYLE_PROPERTIES.filter(
    (property) => !CLIPBOARD_BLOCKED_STYLE_PROPERTIES.has(property),
);
const CLIPBOARD_SANITIZE_OPTIONS = {
    allowedStyleProperties: CLIPBOARD_ALLOWED_STYLE_PROPERTIES,
    allowBackgroundColor: false,
    allowFontFamily: false,
    allowLayoutAttributes: false,
};

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

export function sanitizeHtml(html, options = {}) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const sanitizeOptions = {
        allowedStyleProperties: options.allowedStyleProperties || ALLOWED_STYLE_PROPERTIES,
        allowBackgroundColor: options.allowBackgroundColor !== false,
        allowFontFamily: options.allowFontFamily !== false,
        allowLayoutAttributes: options.allowLayoutAttributes !== false,
    };
    const classStyles = collectClassStyles(template.content, sanitizeOptions);
    sanitizeChildren(template.content, classStyles, sanitizeOptions);
    return template.innerHTML;
}

export function sanitizeClipboardHtml(html) {
    return sanitizeHtml(html, CLIPBOARD_SANITIZE_OPTIONS);
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

function collectClassStyles(root, options) {
    const classStyles = new Map();
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;

    for (const styleElement of root.querySelectorAll("style")) {
        const styleText = styleElement.textContent || "";
        let rule;

        while ((rule = rulePattern.exec(styleText))) {
            const safeStyle = sanitizeStyle(rule[2], options.allowedStyleProperties);
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

function sanitizeChildren(parent, classStyles, options) {
    for (const child of [...parent.childNodes]) {
        sanitizeNode(child, classStyles, options);
    }
}

function sanitizeNode(node, classStyles, options) {
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

    sanitizeChildren(node, classStyles, options);

    if (!ALLOWED_TAGS.has(tagName)) {
        node.replaceWith(...node.childNodes);
        return;
    }

    sanitizeAttributes(node, classStyles, options);
}

function sanitizeAttributes(node, classStyles, options) {
    const originalAttributes = new Map([...node.attributes].map((attribute) => [attribute.name.toLowerCase(), attribute.value]));
    const styleParts = [];
    appendClassStyles(styleParts, originalAttributes.get("class"), classStyles);
    appendPresentationAttributeStyles(styleParts, node, originalAttributes, options);
    if (node.tagName === "FONT") appendFontAttributeStyles(styleParts, originalAttributes, options);
    styleParts.push(originalAttributes.get("style") || "");

    for (const attribute of [...node.attributes]) {
        node.removeAttribute(attribute.name);
    }

    const safeStyle = sanitizeStyle(styleParts.filter(Boolean).join("; "), options.allowedStyleProperties);
    if (safeStyle) node.setAttribute("style", safeStyle);

    restoreSafeAttributes(node, originalAttributes, options);
}

function appendClassStyles(styleParts, classNames, classStyles) {
    for (const className of String(classNames || "").split(/\s+/).filter(Boolean)) {
        const classStyle = classStyles.get(className);
        if (classStyle) styleParts.push(classStyle);
    }
}

function appendPresentationAttributeStyles(styleParts, node, attributes, options) {
    const align = attributes.get("align");
    if (["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH"].includes(node.tagName)) {
        appendMatchingStyle(styleParts, "text-align", align, /^(left|right|center|justify)$/i);
    }

    const verticalAlign = attributes.get("valign");
    if (["TD", "TH", "TR"].includes(node.tagName)) {
        appendMatchingStyle(styleParts, "vertical-align", verticalAlign, /^(top|middle|bottom|baseline)$/i);
    }

    if (options.allowBackgroundColor && ["TABLE", "TBODY", "TFOOT", "THEAD", "TR", "TD", "TH"].includes(node.tagName)) {
        appendSafeStyle(styleParts, "background-color", attributes.get("bgcolor"));
    }

    if (options.allowLayoutAttributes && ["TABLE", "TD", "TH", "COL", "COLGROUP"].includes(node.tagName)) {
        appendLengthStyle(styleParts, "width", attributes.get("width"));
    }

    if (options.allowLayoutAttributes && ["TABLE", "TD", "TH"].includes(node.tagName)) {
        appendLengthStyle(styleParts, "height", attributes.get("height"));
    }

    if (["TABLE", "TD", "TH"].includes(node.tagName)) {
        const border = normalizeCssLength(attributes.get("border"));
        if (border && border !== "0px") styleParts.push(`border: ${border} solid currentColor`);
    }

    if (options.allowLayoutAttributes && node.tagName === "TABLE") {
        appendLengthStyle(styleParts, "border-spacing", attributes.get("cellspacing"));
    }
}

function sanitizeStyle(styleText, allowedStyleProperties = ALLOWED_STYLE_PROPERTIES) {
    if (!styleText) return "";

    const parser = document.createElement("span");
    parser.setAttribute("style", styleText);

    return allowedStyleProperties.map((property) => {
        const value = parser.style.getPropertyValue(property).trim();
        if (!value || UNSAFE_STYLE_VALUE.test(value)) return "";

        const priority = parser.style.getPropertyPriority(property);
        return `${property}: ${value}${priority ? ` !${priority}` : ""}`;
    }).filter(Boolean).join("; ");
}

function appendFontAttributeStyles(styleParts, attributes, options) {
    const color = attributes.get("color");
    if (isSafeStyleAttributeValue(color)) styleParts.push(`color: ${color}`);

    const face = attributes.get("face");
    if (options.allowFontFamily && isSafeStyleAttributeValue(face)) styleParts.push(`font-family: ${face}`);

    const size = sanitizeFontSize(attributes.get("size"));
    if (size) styleParts.push(`font-size: ${size}`);
}

function restoreSafeAttributes(node, attributes, options) {
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
        if (options.allowLayoutAttributes) {
            setPositiveIntegerAttribute(node, "cellpadding", attributes.get("cellpadding"));
            setPositiveIntegerAttribute(node, "cellspacing", attributes.get("cellspacing"));
        }
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
