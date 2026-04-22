import { APP_CONFIG } from "./config.js";
import { escapeHtml, sanitizeHtml } from "./sanitize.js";

export function downloadNovel(format, novel) {
    if (!novel) return;

    if (format === "txt") {
        downloadTextNovel(novel);
        return;
    }

    downloadDocxLikeHtml(novel);
}

export function backupTestState({ library, settings, characters }) {
    const payload = {
        version: APP_CONFIG.version,
        backupDate: new Date().toISOString(),
        library,
        settings,
        characters,
    };
    saveBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
        `Webeditor_Test_Backup_${new Date().toISOString().slice(0, 10)}.json`,
    );
}

function downloadTextNovel(novel) {
    const divider = "\n\n====================\n\n";
    const text = novel.chapters.map((chapter) => {
        const tmp = document.createElement("div");
        tmp.innerHTML = sanitizeHtml(chapter.content).replace(/<br\s*\/?>/gi, "\n");
        return `[${chapter.title}]\n\n${tmp.textContent}`;
    }).join(divider);
    saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${novel.title}.txt`);
}

function downloadDocxLikeHtml(novel) {
    const title = escapeHtml(novel.title);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${
        novel.chapters.map((chapter) => `<h1>${escapeHtml(chapter.title)}</h1>${sanitizeHtml(chapter.content)}`).join("<hr>")
    }</body></html>`;
    saveBlob(
        new Blob([html], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }),
        `${novel.title}.docx`,
    );
}

function saveBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}
