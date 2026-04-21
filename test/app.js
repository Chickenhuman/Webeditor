import {
    APP_CONFIG,
    DEFAULT_SETTINGS,
    MESSAGES,
    cloneData,
    createId,
} from "./modules/config.js";
import { createCloudMock } from "./modules/cloud.mock.js";
import {
    getProductionStorageSnapshot,
    loadTestState,
    resetTestData,
    saveCharacters,
    saveLastActive,
    saveLibrary,
    saveSettings,
} from "./modules/storage.js";

const $ = (id) => document.getElementById(id);

const elements = {
    appShell: $("appShell"),
    modeBadge: $("modeBadge"),
    productionStorageState: $("productionStorageState"),
    mobileOverlay: $("mobileOverlay"),
    sidebar: $("sidebar"),
    sidebarList: $("sidebarList"),
    sidebarTitle: $("sidebarTitle"),
    sidebarActionBtn: $("sidebarActionBtn"),
    libraryHomeBtn: $("libraryHomeBtn"),
    sidebarStatus: $("sidebarStatus"),
    userInfoDisplay: $("userInfoDisplay"),
    versionDisplay: $("versionDisplay"),
    btnMobileMenu: $("btnMobileMenu"),
    btnSave: $("btnSave"),
    btnResetTestData: $("btnResetTestData"),
    btnSettings: $("btnSettings"),
    settingsPopup: $("settingsPopup"),
    lineBreakOption: $("lineBreakOption"),
    ignoreEllipsis: $("ignoreEllipsis"),
    btnRunLineBreak: $("btnRunLineBreak"),
    btnMemo: $("btnMemo"),
    btnHtmlMode: $("btnHtmlMode"),
    btnExportTxt: $("btnExportTxt"),
    btnExportDocx: $("btnExportDocx"),
    btnCharacters: $("btnCharacters"),
    btnSnapshotSave: $("btnSnapshotSave"),
    btnSnapshots: $("btnSnapshots"),
    btnBackup: $("btnBackup"),
    btnTheme: $("btnTheme"),
    btnFileOpen: $("btnFileOpen"),
    btnBackupRestore: $("btnBackupRestore"),
    btnMoreMenu: $("btnMoreMenu"),
    rightToolbarItems: $("rightToolbarItems"),
    fileInput: $("fileInput"),
    backupInput: $("backupInput"),
    editorWrapper: $("editorWrapper"),
    titleInput: $("titleInput"),
    formatToolbar: $("formatToolbar"),
    symbolGroup: $("symbolGroup"),
    btnSymbolEditor: $("btnSymbolEditor"),
    symbolEditModal: $("symbolEditModal"),
    symbolInput: $("symbolInput"),
    btnCloseSymbolEditor: $("btnCloseSymbolEditor"),
    btnSaveSymbols: $("btnSaveSymbols"),
    editor: $("mainEditor"),
    htmlEditor: $("htmlSourceEditor"),
    autoSaveInput: $("autoSaveIntervalInput"),
    unsavedDot: $("unsavedDot"),
    lastSavedDisplay: $("lastSavedDisplay"),
    targetCountInput: $("targetCountInput"),
    goalTypeSelect: $("goalTypeSelect"),
    goalProgressBar: $("goalProgressBar"),
    goalPercentage: $("goalPercentage"),
    charCount: $("charCount"),
    charCountNoSpace: $("charCountNoSpace"),
    memoPanel: $("memoPanel"),
    memoTextarea: $("memoTextarea"),
    btnCloseMemo: $("btnCloseMemo"),
    searchModal: $("searchModal"),
    btnSearch: $("btnSearch"),
    btnCloseSearch: $("btnCloseSearch"),
    findInput: $("findInput"),
    replaceInput: $("replaceInput"),
    btnReplaceAll: $("btnReplaceAll"),
    historyModal: $("historyModal"),
    btnCloseHistory: $("btnCloseHistory"),
    snapshotList: $("snapshotList"),
    characterModal: $("characterModal"),
    btnCloseCharacters: $("btnCloseCharacters"),
    btnAddCharacter: $("btnAddCharacter"),
    characterList: $("characterList"),
    charDetailForm: $("charDetailForm"),
    charEmptyState: $("charEmptyState"),
    charName: $("charName"),
    charAge: $("charAge"),
    charRole: $("charRole"),
    charAppearance: $("charAppearance"),
    charPersonality: $("charPersonality"),
    btnSaveCharacter: $("btnSaveCharacter"),
    btnDeleteCharacter: $("btnDeleteCharacter"),
    toast: $("toast"),
};

const cloud = createCloudMock();
const initialState = loadTestState();

let library = initialState.library;
let settings = initialState.settings;
let characters = initialState.characters;
let currentUser = null;
let currentNovelId = null;
let currentChapterId = null;
let selectedCharacterId = null;
let viewMode = "library";
let isHtmlMode = false;
let hasUnsavedChanges = false;
let autoSaveTimerId = null;
let historyDebounceTimer = null;
let undoStack = [];
let redoStack = [];
let draggedChapterId = null;

function setHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle("is-hidden", hidden);
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

function getCurrentNovel() {
    return library.find((novel) => novel.id === currentNovelId) || null;
}

function getCurrentChapter() {
    const novel = getCurrentNovel();
    return novel?.chapters.find((chapter) => chapter.id === currentChapterId) || null;
}

function getLastActive() {
    if (!currentNovelId || !currentChapterId) return null;
    return { novelId: currentNovelId, chapterId: currentChapterId };
}

function persistLocalState() {
    saveLibrary(library);
    saveSettings(settings);
    saveCharacters(characters);
    const lastActive = getLastActive();
    if (lastActive) saveLastActive(lastActive);
}

async function syncMockCloud(statusMessage = MESSAGES.savedCloud) {
    await cloud.syncState({
        library,
        settings,
        characters,
        lastActive: getLastActive(),
    });
    updateSavedIndicator(statusMessage);
}

function renderStorageGuard() {
    const snapshot = getProductionStorageSnapshot();
    const changedKeys = Object.entries(snapshot)
        .filter(([, value]) => value !== null)
        .map(([key]) => key);

    elements.productionStorageState.textContent = changedKeys.length
        ? `운영 키 감지됨: ${changedKeys.join(", ")} (테스트 앱은 읽기/쓰기 안 함)`
        : "운영 localStorage 키 없음. 테스트 저장소만 사용 중";
}

function renderVersion() {
    elements.versionDisplay.textContent = `${APP_CONFIG.version} / ${APP_CONFIG.lastUpdated}`;
    elements.modeBadge.textContent = "TEST MODE";
}

function applySettings() {
    document.body.classList.toggle("dark-mode", Boolean(settings.darkMode));
    elements.btnTheme.textContent = settings.darkMode ? "☀" : "☾";
    elements.autoSaveInput.value = settings.autoSaveMin || DEFAULT_SETTINGS.autoSaveMin;
    elements.targetCountInput.value = settings.targetCount || DEFAULT_SETTINGS.targetCount;
    elements.goalTypeSelect.value = settings.goalType || DEFAULT_SETTINGS.goalType;
}

function startAutoSaveTimer() {
    if (autoSaveTimerId) window.clearInterval(autoSaveTimerId);
    const minutes = Number.parseInt(elements.autoSaveInput.value, 10) || APP_CONFIG.autosaveFallbackMinutes;
    settings.autoSaveMin = minutes;
    saveSettings(settings);
    autoSaveTimerId = window.setInterval(() => {
        if (hasUnsavedChanges) performSave();
    }, minutes * 60 * 1000);
}

function updateSavedIndicator(message = MESSAGES.ready) {
    hasUnsavedChanges = false;
    elements.unsavedDot.classList.remove("active");
    elements.lastSavedDisplay.textContent = message;
    elements.lastSavedDisplay.classList.remove("unsaved");
}

function markAsUnsaved() {
    if (!hasUnsavedChanges) {
        hasUnsavedChanges = true;
        elements.unsavedDot.classList.add("active");
        elements.lastSavedDisplay.textContent = MESSAGES.unsaved;
        elements.lastSavedDisplay.classList.add("unsaved");
    }
    updateCount();
}

function updateCount() {
    const text = elements.editor.textContent || "";
    const countWithSpace = text.length;
    const countNoSpace = text.replace(/\s/g, "").length;
    elements.charCount.textContent = String(countWithSpace);
    elements.charCountNoSpace.textContent = String(countNoSpace);
    updateGoalProgress(countWithSpace, countNoSpace);
}

function updateGoalProgress(countWithSpace = Number(elements.charCount.textContent), countNoSpace = Number(elements.charCountNoSpace.textContent)) {
    const target = Math.max(Number.parseInt(elements.targetCountInput.value, 10) || DEFAULT_SETTINGS.targetCount, 1);
    const current = elements.goalTypeSelect.value === "nospace" ? countNoSpace : countWithSpace;
    const cappedPercent = Math.min((current / target) * 100, 100);
    elements.goalProgressBar.style.width = `${cappedPercent}%`;
    elements.goalPercentage.textContent = `${Math.floor((current / target) * 100)}%`;
}

function recordHistory() {
    const content = isHtmlMode ? elements.htmlEditor.value : elements.editor.innerHTML;
    if (undoStack.at(-1) === content) return;
    undoStack.push(content);
    if (undoStack.length > APP_CONFIG.maxHistory) undoStack.shift();
    redoStack = [];
}

function applyHistoryContent(content) {
    if (isHtmlMode) {
        elements.htmlEditor.value = content;
    } else {
        elements.editor.innerHTML = content;
    }
    markAsUnsaved();
    updateCount();
}

function performUndo() {
    if (!undoStack.length) return;
    redoStack.push(isHtmlMode ? elements.htmlEditor.value : elements.editor.innerHTML);
    applyHistoryContent(undoStack.pop());
}

function performRedo() {
    if (!redoStack.length) return;
    undoStack.push(isHtmlMode ? elements.htmlEditor.value : elements.editor.innerHTML);
    applyHistoryContent(redoStack.pop());
}

function syncEditorFromHtmlMode() {
    if (isHtmlMode) {
        elements.editor.innerHTML = elements.htmlEditor.value;
    }
}

function setHtmlMode(enabled) {
    isHtmlMode = enabled;
    if (isHtmlMode) {
        elements.htmlEditor.value = elements.editor.innerHTML;
        setHidden(elements.editor, true);
        setHidden(elements.htmlEditor, false);
        elements.btnHtmlMode.classList.add("active");
    } else {
        elements.editor.innerHTML = elements.htmlEditor.value;
        setHidden(elements.htmlEditor, true);
        setHidden(elements.editor, false);
        elements.btnHtmlMode.classList.remove("active");
        updateCount();
    }
}

function makeButton(label, className, action, title = label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.dataset.action = action;
    button.title = title;
    return button;
}

function renderLibrary() {
    viewMode = "library";
    currentNovelId = null;
    currentChapterId = null;
    elements.sidebarTitle.textContent = "테스트 서재";
    elements.sidebarActionBtn.textContent = "+";
    elements.sidebarActionBtn.title = "테스트 소설 추가";
    elements.sidebarStatus.textContent = `테스트 소설 ${library.length}개`;
    setHidden(elements.libraryHomeBtn, true);
    setHidden(elements.editorWrapper, true);

    elements.sidebarList.replaceChildren();
    library.forEach((novel) => {
        const item = document.createElement("li");
        item.className = "list-item novel-item";
        item.dataset.id = novel.id;
        item.dataset.action = "open-novel";

        const label = document.createElement("span");
        label.className = "item-title";
        label.textContent = `${novel.password ? "🔒" : "📘"} ${novel.title}`;

        const actions = document.createElement("span");
        actions.className = "item-actions";
        actions.append(
            makeButton(novel.password ? "해제" : "잠금", "mini-btn", "toggle-lock"),
            makeButton("삭제", "mini-btn danger", "delete-novel"),
        );

        item.append(label, actions);
        elements.sidebarList.appendChild(item);
    });
}

function renderNovelSidebar() {
    const novel = getCurrentNovel();
    if (!novel) {
        renderLibrary();
        return;
    }

    viewMode = "novel";
    elements.sidebarTitle.textContent = novel.title;
    elements.sidebarActionBtn.textContent = "+";
    elements.sidebarActionBtn.title = "테스트 챕터 추가";
    elements.sidebarStatus.textContent = "챕터 정렬/삭제 가능";
    setHidden(elements.libraryHomeBtn, false);
    setHidden(elements.editorWrapper, false);

    elements.sidebarList.replaceChildren();
    novel.chapters.forEach((chapter, index) => {
        const item = document.createElement("li");
        item.className = `list-item chapter-item ${chapter.id === currentChapterId ? "active" : ""}`;
        item.dataset.id = chapter.id;
        item.dataset.action = "open-chapter";
        item.draggable = true;

        const label = document.createElement("span");
        label.className = "item-title";
        label.textContent = chapter.title || "무제";

        const actions = document.createElement("span");
        actions.className = "item-actions";
        actions.append(
            makeButton("↑", "mini-btn", "move-chapter-up", "위로 이동"),
            makeButton("↓", "mini-btn", "move-chapter-down", "아래로 이동"),
            makeButton("삭제", "mini-btn danger", "delete-chapter"),
        );

        actions.querySelector('[data-action="move-chapter-up"]').disabled = index === 0;
        actions.querySelector('[data-action="move-chapter-down"]').disabled = index === novel.chapters.length - 1;
        item.append(label, actions);
        elements.sidebarList.appendChild(item);
    });
}

function createNovel(title) {
    const novel = {
        id: createId("novel"),
        title,
        memo: "",
        chapters: [
            {
                id: createId("chapter"),
                title: APP_CONFIG.defaultChapterTitle,
                content: "",
            },
        ],
    };

    library.push(novel);
    currentNovelId = novel.id;
    currentChapterId = novel.chapters[0].id;
    persistLocalState();
    openNovel(novel.id, { skipLock: true });
}

function promptCreateNovel() {
    const title = window.prompt("테스트 소설 제목", APP_CONFIG.defaultNovelTitle);
    if (title?.trim()) createNovel(title.trim());
}

function deleteNovel(id) {
    if (!window.confirm("선택한 테스트 소설을 삭제할까요?")) return;
    library = library.filter((novel) => novel.id !== id);
    if (!library.length) {
        createNovel(APP_CONFIG.defaultNovelTitle);
        return;
    }
    persistLocalState();
    renderLibrary();
}

function openNovel(id, options = {}) {
    const novel = library.find((item) => item.id === id);
    if (!novel) return;

    if (novel.password && !options.skipLock) {
        const input = window.prompt(MESSAGES.lockedNovelPrompt);
        if (input !== novel.password) {
            showToast("비밀번호가 일치하지 않습니다.");
            renderLibrary();
            return;
        }
    }

    currentNovelId = novel.id;
    if (!novel.chapters.length) {
        novel.chapters.push({
            id: createId("chapter"),
            title: APP_CONFIG.defaultChapterTitle,
            content: "",
        });
    }

    currentChapterId = options.chapterId && novel.chapters.some((chapter) => chapter.id === options.chapterId)
        ? options.chapterId
        : novel.chapters[0].id;
    elements.memoTextarea.value = novel.memo || "";
    renderNovelSidebar();
    loadChapter(currentChapterId);
}

function addNewChapter() {
    performSave();
    const novel = getCurrentNovel();
    if (!novel) return;

    const chapter = {
        id: createId("chapter"),
        title: `${novel.chapters.length + 1}화`,
        content: "",
    };
    novel.chapters.push(chapter);
    persistLocalState();
    loadChapter(chapter.id);
}

function deleteChapter(id) {
    const novel = getCurrentNovel();
    if (!novel) return;
    if (novel.chapters.length <= 1) {
        showToast(MESSAGES.minChapter);
        return;
    }
    if (!window.confirm("선택한 테스트 챕터를 삭제할까요?")) return;

    novel.chapters = novel.chapters.filter((chapter) => chapter.id !== id);
    currentChapterId = novel.chapters[0].id;
    persistLocalState();
    loadChapter(currentChapterId);
}

function moveChapter(id, direction) {
    const novel = getCurrentNovel();
    if (!novel) return;
    const index = novel.chapters.findIndex((chapter) => chapter.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= novel.chapters.length) return;

    const [chapter] = novel.chapters.splice(index, 1);
    novel.chapters.splice(nextIndex, 0, chapter);
    persistLocalState();
    renderNovelSidebar();
}

function loadChapter(id) {
    const novel = getCurrentNovel();
    const chapter = novel?.chapters.find((item) => item.id === id);
    if (!chapter) return;

    if (isHtmlMode) setHtmlMode(false);
    currentChapterId = id;
    elements.titleInput.value = chapter.title || "";
    elements.editor.innerHTML = chapter.content || "";
    elements.htmlEditor.value = chapter.content || "";
    undoStack = [];
    redoStack = [];
    updateSavedIndicator(MESSAGES.ready);
    updateCount();
    saveLastActive(getLastActive());
    renderNovelSidebar();
}

function switchChapter(id) {
    performSave();
    loadChapter(id);
}

function performSave() {
    if (viewMode === "library") return;
    const novel = getCurrentNovel();
    const chapter = getCurrentChapter();
    if (!novel || !chapter) {
        showToast(MESSAGES.noNovel);
        return;
    }

    syncEditorFromHtmlMode();
    chapter.title = elements.titleInput.value.trim() || "무제";
    chapter.content = elements.editor.innerHTML;
    novel.memo = elements.memoTextarea.value;
    persistLocalState();
    updateSavedIndicator(MESSAGES.savedLocal);
    syncMockCloud().catch((error) => console.error("Mock cloud save failed", error));
}

function toggleLock(id) {
    const novel = library.find((item) => item.id === id);
    if (!novel) return;

    if (novel.password) {
        const input = window.prompt(MESSAGES.lockedNovelPrompt);
        if (input === novel.password) {
            delete novel.password;
            persistLocalState();
            renderLibrary();
            showToast("테스트 잠금이 해제되었습니다.");
        } else if (input !== null) {
            showToast("비밀번호가 일치하지 않습니다.");
        }
        return;
    }

    const password = window.prompt(MESSAGES.lockPasswordPrompt);
    if (!password) return;
    const confirmPassword = window.prompt(MESSAGES.lockPasswordConfirmPrompt);
    if (password !== confirmPassword) {
        showToast("비밀번호가 일치하지 않습니다.");
        return;
    }

    novel.password = password;
    persistLocalState();
    renderLibrary();
    showToast("테스트 잠금이 설정되었습니다.");
}

function renderSymbols() {
    elements.symbolGroup.replaceChildren();
    const symbols = (settings.customSymbols || DEFAULT_SETTINGS.customSymbols)
        .split(",")
        .map((symbol) => symbol.trim())
        .filter(Boolean);

    symbols.forEach((symbol) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-symbol";
        button.textContent = symbol;
        button.dataset.open = symbol.length === 2 ? symbol[0] : symbol;
        button.dataset.close = symbol.length === 2 ? symbol[1] : "";
        elements.symbolGroup.appendChild(button);
    });
}

function insertSymbol(open, close = "") {
    if (isHtmlMode) return;
    recordHistory();
    elements.editor.focus();
    document.execCommand("insertText", false, `${open}${close}`);

    if (close) {
        const selection = window.getSelection();
        if (selection?.rangeCount) {
            const range = selection.getRangeAt(0);
            range.setStart(range.startContainer, Math.max(range.startOffset - close.length, 0));
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }
    markAsUnsaved();
}

function executeFormatCommand(command) {
    if (isHtmlMode) return;
    recordHistory();
    document.execCommand(command, false, null);
    elements.editor.focus();
    markAsUnsaved();
}

function toggleMemoPanel() {
    elements.memoPanel.classList.toggle("open");
}

function toggleSearchModal() {
    elements.searchModal.classList.toggle("open");
    if (elements.searchModal.classList.contains("open")) elements.findInput.focus();
}

function findAndReplace() {
    const find = elements.findInput.value;
    const replace = elements.replaceInput.value;
    if (!find || isHtmlMode) return;
    if (!window.confirm(MESSAGES.replaceConfirm)) return;

    const before = elements.editor.innerHTML;
    const after = before.split(find).join(replace);
    if (before === after) {
        showToast(MESSAGES.replaceNone);
        return;
    }

    recordHistory();
    elements.editor.innerHTML = after;
    markAsUnsaved();
    toggleSearchModal();
    showToast(MESSAGES.replaceDone);
}

function autoLineBreak() {
    if (isHtmlMode) return;
    const lineBreak = elements.lineBreakOption.value === "2" ? "<br><br>" : "<br>";
    const ignoreEllipsis = elements.ignoreEllipsis.checked;
    const pattern = ignoreEllipsis ? /(?<!\.)\.(\s|&nbsp;)/g : /\.(\s|&nbsp;)/g;
    const before = elements.editor.innerHTML;
    const after = before.replace(pattern, `.${lineBreak}`);

    if (before === after) {
        showToast("변경할 문장이 없습니다.");
        return;
    }

    recordHistory();
    elements.editor.innerHTML = after;
    elements.htmlEditor.value = after;
    markAsUnsaved();
    showToast("줄바꿈 정리가 완료되었습니다.");
}

function saveBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}

function downloadAll(format) {
    const novel = getCurrentNovel();
    if (!novel) return;
    performSave();

    if (format === "txt") {
        const divider = "\n\n====================\n\n";
        const text = novel.chapters.map((chapter) => {
            const tmp = document.createElement("div");
            tmp.innerHTML = chapter.content.replace(/<br\s*\/?>/gi, "\n");
            return `[${chapter.title}]\n\n${tmp.textContent}`;
        }).join(divider);
        saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${novel.title}.txt`);
        return;
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${novel.title}</title></head><body>${
        novel.chapters.map((chapter) => `<h1>${chapter.title}</h1>${chapter.content}`).join("<hr>")
    }</body></html>`;
    saveBlob(new Blob([html], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `${novel.title}.docx`);
}

function backupData() {
    performSave();
    const payload = {
        version: APP_CONFIG.version,
        backupDate: new Date().toISOString(),
        library,
        settings,
        characters,
    };
    saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `Webeditor_Test_Backup_${new Date().toISOString().slice(0, 10)}.json`);
}

function restoreData(event) {
    const file = event.target.files[0];
    if (!file || !window.confirm(MESSAGES.backupRestoreConfirm)) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            library = Array.isArray(data.library) ? data.library : library;
            settings = { ...settings, ...(data.settings || {}) };
            characters = Array.isArray(data.characters) ? data.characters : characters;
            persistLocalState();
            applySettings();
            renderSymbols();
            renderLibrary();
            showToast("테스트 백업 복원이 완료되었습니다.");
        } catch (error) {
            console.error(error);
            showToast("백업 파일을 읽지 못했습니다.");
        } finally {
            event.target.value = "";
        }
    };
    reader.readAsText(file);
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const content = String(reader.result).replace(/\n/g, "<br>");
        const novel = getCurrentNovel();
        if (!novel) return;
        novel.chapters.push({
            id: createId("chapter"),
            title: file.name.replace(/\.(txt|docx)$/i, ""),
            content,
        });
        persistLocalState();
        loadChapter(novel.chapters.at(-1).id);
        event.target.value = "";
    };
    reader.readAsText(file);
}

async function saveSnapshot() {
    if (!window.confirm(MESSAGES.snapshotSaveConfirm)) return;
    performSave();
    await cloud.saveSnapshot({
        library,
        settings,
        characters,
        lastActive: getLastActive(),
    });
    showToast("mock 스냅샷이 저장되었습니다.");
}

async function renderSnapshotList() {
    const snapshots = await cloud.listSnapshots();
    elements.snapshotList.replaceChildren();
    if (!snapshots.length) {
        const empty = document.createElement("p");
        empty.className = "empty-message";
        empty.textContent = "저장된 mock 스냅샷이 없습니다.";
        elements.snapshotList.appendChild(empty);
        return;
    }

    snapshots.forEach((snapshot) => {
        const item = document.createElement("article");
        item.className = "history-item";

        const info = document.createElement("div");
        info.className = "history-info";

        const date = document.createElement("strong");
        date.textContent = new Date(snapshot.savedAt).toLocaleString();
        const summary = document.createElement("span");
        summary.textContent = snapshot.summary;
        info.append(date, summary);

        const actions = document.createElement("div");
        actions.className = "history-actions";
        const loadButton = makeButton("불러오기", "btn-tool small", "load-snapshot");
        const deleteButton = makeButton("삭제", "btn-tool small danger", "delete-snapshot");
        loadButton.dataset.id = snapshot.id;
        deleteButton.dataset.id = snapshot.id;
        actions.append(loadButton, deleteButton);

        item.append(info, actions);
        elements.snapshotList.appendChild(item);
    });
}

async function openSnapshotList() {
    elements.historyModal.classList.add("open");
    await renderSnapshotList();
}

async function loadSnapshot(id) {
    if (!window.confirm(MESSAGES.snapshotLoadConfirm)) return;
    const snapshot = await cloud.loadSnapshot(id);
    if (!snapshot) {
        showToast("mock 스냅샷을 찾지 못했습니다.");
        return;
    }

    library = cloneData(snapshot.data.library);
    settings = { ...DEFAULT_SETTINGS, ...cloneData(snapshot.data.settings) };
    characters = cloneData(snapshot.data.characters);
    persistLocalState();
    applySettings();
    renderSymbols();
    elements.historyModal.classList.remove("open");
    const lastActive = snapshot.data.lastActive;
    if (lastActive?.novelId) {
        openNovel(lastActive.novelId, { chapterId: lastActive.chapterId, skipLock: true });
    } else {
        renderLibrary();
    }
    showToast("mock 스냅샷이 복원되었습니다.");
}

async function deleteSnapshot(id) {
    if (!window.confirm(MESSAGES.snapshotDeleteConfirm)) return;
    await cloud.deleteSnapshot(id);
    await renderSnapshotList();
}

function renderCharacterList() {
    elements.characterList.replaceChildren();
    characters.forEach((character) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `char-item ${character.id === selectedCharacterId ? "active" : ""}`;
        item.dataset.id = character.id;
        item.dataset.action = "select-character";

        const avatar = document.createElement("span");
        avatar.className = "char-avatar";
        avatar.textContent = character.name?.[0] || "?";

        const info = document.createElement("span");
        info.className = "char-info";
        const name = document.createElement("strong");
        name.textContent = character.name || "이름 없음";
        const role = document.createElement("small");
        role.textContent = character.role || "역할 미정";
        info.append(name, role);

        item.append(avatar, info);
        elements.characterList.appendChild(item);
    });
}

function openCharacterModal() {
    elements.characterModal.classList.add("open");
    renderCharacterList();
}

function selectCharacter(id) {
    selectedCharacterId = id;
    const character = characters.find((item) => item.id === id);
    if (!character) return;

    setHidden(elements.charDetailForm, false);
    setHidden(elements.charEmptyState, true);
    elements.charName.value = character.name || "";
    elements.charAge.value = character.age || "";
    elements.charRole.value = character.role || "";
    elements.charAppearance.value = character.appearance || "";
    elements.charPersonality.value = character.personality || "";
    renderCharacterList();
}

function addNewCharacter() {
    const character = {
        id: createId("character"),
        name: "새 캐릭터",
        age: "",
        role: "",
        appearance: "",
        personality: "",
    };
    characters.push(character);
    saveCharacters(characters);
    selectCharacter(character.id);
}

function saveCurrentCharacter() {
    const character = characters.find((item) => item.id === selectedCharacterId);
    if (!character) return;

    character.name = elements.charName.value;
    character.age = elements.charAge.value;
    character.role = elements.charRole.value;
    character.appearance = elements.charAppearance.value;
    character.personality = elements.charPersonality.value;
    saveCharacters(characters);
    renderCharacterList();
    showToast("캐릭터 설정이 저장되었습니다.");
}

function deleteCurrentCharacter() {
    if (!selectedCharacterId || !window.confirm("선택한 테스트 캐릭터를 삭제할까요?")) return;
    characters = characters.filter((character) => character.id !== selectedCharacterId);
    selectedCharacterId = null;
    saveCharacters(characters);
    renderCharacterList();
    setHidden(elements.charDetailForm, true);
    setHidden(elements.charEmptyState, false);
}

function handleSidebarClick(event) {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const item = actionButton.closest("[data-id]");
    const id = item?.dataset.id || actionButton.dataset.id;
    const action = actionButton.dataset.action;

    if (action === "open-novel") openNovel(id);
    if (action === "delete-novel") deleteNovel(id);
    if (action === "toggle-lock") toggleLock(id);
    if (action === "open-chapter") switchChapter(id);
    if (action === "delete-chapter") deleteChapter(id);
    if (action === "move-chapter-up") moveChapter(id, -1);
    if (action === "move-chapter-down") moveChapter(id, 1);

    if (window.innerWidth <= 768 && ["open-novel", "open-chapter"].includes(action)) {
        elements.sidebar.classList.remove("open");
        elements.mobileOverlay.classList.remove("active");
    }
}

function handleChapterDragStart(event) {
    const item = event.target.closest(".chapter-item");
    if (!item || viewMode !== "novel") return;
    draggedChapterId = item.dataset.id;
    item.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
}

function handleChapterDragEnd(event) {
    event.target.closest(".chapter-item")?.classList.remove("dragging");
    draggedChapterId = null;
}

function handleChapterDragOver(event) {
    if (!draggedChapterId || viewMode !== "novel") return;
    event.preventDefault();
    const target = event.target.closest(".chapter-item");
    if (!target || target.dataset.id === draggedChapterId) return;

    const novel = getCurrentNovel();
    const from = novel.chapters.findIndex((chapter) => chapter.id === draggedChapterId);
    const to = novel.chapters.findIndex((chapter) => chapter.id === target.dataset.id);
    if (from < 0 || to < 0 || from === to) return;

    const [chapter] = novel.chapters.splice(from, 1);
    novel.chapters.splice(to, 0, chapter);
    persistLocalState();
    renderNovelSidebar();
}

function bindEvents() {
    elements.sidebarActionBtn.addEventListener("click", () => {
        if (viewMode === "library") promptCreateNovel();
        else addNewChapter();
    });
    elements.libraryHomeBtn.addEventListener("click", () => {
        performSave();
        renderLibrary();
    });
    elements.sidebarList.addEventListener("click", handleSidebarClick);
    elements.sidebarList.addEventListener("dragstart", handleChapterDragStart);
    elements.sidebarList.addEventListener("dragend", handleChapterDragEnd);
    elements.sidebarList.addEventListener("dragover", handleChapterDragOver);

    elements.btnMobileMenu.addEventListener("click", () => {
        elements.sidebar.classList.add("open");
        elements.mobileOverlay.classList.add("active");
    });
    elements.mobileOverlay.addEventListener("click", () => {
        elements.sidebar.classList.remove("open");
        elements.mobileOverlay.classList.remove("active");
    });
    if (elements.btnMoreMenu && elements.rightToolbarItems) {
        elements.btnMoreMenu.addEventListener("click", (event) => {
            event.stopPropagation();
            elements.rightToolbarItems.classList.toggle("show");
        });
        elements.rightToolbarItems.addEventListener("click", () => {
            if (window.innerWidth <= 768) elements.rightToolbarItems.classList.remove("show");
        });
        document.addEventListener("click", (event) => {
            if (!elements.rightToolbarItems.contains(event.target) && !elements.btnMoreMenu.contains(event.target)) {
                elements.rightToolbarItems.classList.remove("show");
            }
        });
    }

    elements.btnSave.addEventListener("click", performSave);
    elements.btnResetTestData.addEventListener("click", () => {
        if (!window.confirm(MESSAGES.testDataResetConfirm)) return;
        const state = resetTestData();
        library = state.library;
        settings = state.settings;
        characters = state.characters;
        applySettings();
        renderSymbols();
        openNovel(state.lastActive.novelId, { chapterId: state.lastActive.chapterId, skipLock: true });
        showToast("테스트 데이터가 초기화되었습니다.");
    });

    elements.btnSettings.addEventListener("click", (event) => {
        event.stopPropagation();
        elements.settingsPopup.classList.toggle("open");
    });
    elements.settingsPopup.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", () => elements.settingsPopup.classList.remove("open"));
    elements.btnRunLineBreak.addEventListener("click", autoLineBreak);

    elements.btnMemo.addEventListener("click", toggleMemoPanel);
    elements.btnCloseMemo.addEventListener("click", toggleMemoPanel);
    elements.btnHtmlMode.addEventListener("click", () => setHtmlMode(!isHtmlMode));
    elements.btnExportTxt.addEventListener("click", () => downloadAll("txt"));
    elements.btnExportDocx.addEventListener("click", () => downloadAll("docx"));
    elements.btnCharacters.addEventListener("click", openCharacterModal);
    elements.btnSnapshotSave.addEventListener("click", saveSnapshot);
    elements.btnSnapshots.addEventListener("click", openSnapshotList);
    elements.btnBackup.addEventListener("click", backupData);
    elements.btnTheme.addEventListener("click", () => {
        settings.darkMode = !settings.darkMode;
        saveSettings(settings);
        applySettings();
    });
    elements.btnFileOpen.addEventListener("click", () => elements.fileInput.click());
    elements.btnBackupRestore.addEventListener("click", () => elements.backupInput.click());
    elements.fileInput.addEventListener("change", handleFileSelect);
    elements.backupInput.addEventListener("change", restoreData);

    elements.formatToolbar.addEventListener("click", (event) => {
        const commandButton = event.target.closest("[data-command]");
        if (commandButton) executeFormatCommand(commandButton.dataset.command);
    });
    elements.symbolGroup.addEventListener("click", (event) => {
        const button = event.target.closest(".btn-symbol");
        if (button) insertSymbol(button.dataset.open, button.dataset.close);
    });
    elements.btnSymbolEditor.addEventListener("click", () => {
        elements.symbolInput.value = settings.customSymbols || DEFAULT_SETTINGS.customSymbols;
        elements.symbolEditModal.classList.add("open");
    });
    elements.btnCloseSymbolEditor.addEventListener("click", () => elements.symbolEditModal.classList.remove("open"));
    elements.btnSaveSymbols.addEventListener("click", () => {
        settings.customSymbols = elements.symbolInput.value;
        saveSettings(settings);
        renderSymbols();
        elements.symbolEditModal.classList.remove("open");
        showToast("기호 설정이 저장되었습니다.");
    });

    elements.btnSearch.addEventListener("click", toggleSearchModal);
    elements.btnCloseSearch.addEventListener("click", toggleSearchModal);
    elements.btnReplaceAll.addEventListener("click", findAndReplace);

    elements.titleInput.addEventListener("input", markAsUnsaved);
    elements.memoTextarea.addEventListener("input", markAsUnsaved);
    elements.editor.addEventListener("input", markAsUnsaved);
    elements.editor.addEventListener("beforeinput", () => {
        if (!historyDebounceTimer) recordHistory();
        window.clearTimeout(historyDebounceTimer);
        historyDebounceTimer = window.setTimeout(() => {
            historyDebounceTimer = null;
        }, 1000);
    });
    elements.editor.addEventListener("paste", (event) => {
        if (isHtmlMode) return;
        event.preventDefault();
        recordHistory();
        document.execCommand("insertText", false, (event.clipboardData || window.clipboardData).getData("text/plain"));
        markAsUnsaved();
    });
    elements.htmlEditor.addEventListener("input", markAsUnsaved);
    elements.autoSaveInput.addEventListener("change", startAutoSaveTimer);
    elements.targetCountInput.addEventListener("input", () => {
        settings.targetCount = Number.parseInt(elements.targetCountInput.value, 10) || DEFAULT_SETTINGS.targetCount;
        saveSettings(settings);
        updateGoalProgress();
    });
    elements.goalTypeSelect.addEventListener("change", () => {
        settings.goalType = elements.goalTypeSelect.value;
        saveSettings(settings);
        updateGoalProgress();
    });

    document.addEventListener("keydown", (event) => {
        if (![elements.editor, elements.htmlEditor].includes(document.activeElement)) return;
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key === "z") {
            event.preventDefault();
            performUndo();
        }
        if ((event.ctrlKey || event.metaKey) && (key === "y" || (event.shiftKey && key === "z"))) {
            event.preventDefault();
            performRedo();
        }
    });

    elements.btnCloseHistory.addEventListener("click", () => elements.historyModal.classList.remove("open"));
    elements.snapshotList.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "load-snapshot") await loadSnapshot(button.dataset.id);
        if (button.dataset.action === "delete-snapshot") await deleteSnapshot(button.dataset.id);
    });

    elements.btnCloseCharacters.addEventListener("click", () => {
        elements.characterModal.classList.remove("open");
        performSave();
    });
    elements.btnAddCharacter.addEventListener("click", addNewCharacter);
    elements.characterList.addEventListener("click", (event) => {
        const item = event.target.closest("[data-action='select-character']");
        if (item) selectCharacter(item.dataset.id);
    });
    elements.btnSaveCharacter.addEventListener("click", saveCurrentCharacter);
    elements.btnDeleteCharacter.addEventListener("click", deleteCurrentCharacter);

    window.addEventListener("beforeunload", (event) => {
        if (!hasUnsavedChanges) return undefined;
        event.preventDefault();
        event.returnValue = MESSAGES.unsaved;
        return MESSAGES.unsaved;
    });
}

async function init() {
    bindEvents();
    currentUser = await cloud.signIn();
    elements.userInfoDisplay.textContent = `${currentUser.displayName}님 (Mock Cloud)`;
    renderVersion();
    renderStorageGuard();
    applySettings();
    renderSymbols();
    startAutoSaveTimer();

    const lastActive = initialState.lastActive;
    const targetNovel = library.find((novel) => novel.id === lastActive?.novelId) || library[0];
    if (targetNovel) {
        openNovel(targetNovel.id, { chapterId: lastActive?.chapterId, skipLock: true });
    } else {
        createNovel(APP_CONFIG.defaultNovelTitle);
    }
    await syncMockCloud(MESSAGES.testModeReady);
    showToast(MESSAGES.testModeReady);
}

init().catch((error) => {
    console.error("Test app failed to initialize", error);
    showToast("테스트 앱 초기화 실패");
});
