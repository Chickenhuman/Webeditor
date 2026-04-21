const ALLOWED_TAGS = new Set([
    "B",
    "BLOCKQUOTE",
    "BR",
    "CODE",
    "DIV",
    "EM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
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
    "U",
    "UL",
]);

const DROP_WITH_CONTENT_TAGS = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE", "TEMPLATE"]);

export function sanitizeHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    sanitizeChildren(template.content);
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
        password: novel.password ? toSafeText(novel.password) : undefined,
        chapters: Array.isArray(novel.chapters)
            ? novel.chapters.map((chapter) => ({
                ...chapter,
                title: toSafeText(chapter.title),
                content: sanitizeHtml(chapter.content),
            }))
            : [],
    }));
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

function sanitizeChildren(parent) {
    for (const child of [...parent.childNodes]) {
        sanitizeNode(child);
    }
}

function sanitizeNode(node) {
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

    sanitizeChildren(node);

    if (!ALLOWED_TAGS.has(tagName)) {
        node.replaceWith(...node.childNodes);
        return;
    }

    for (const attribute of [...node.attributes]) {
        node.removeAttribute(attribute.name);
    }
}
