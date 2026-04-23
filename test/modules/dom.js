import { APP_CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);

export const elements = {
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
    btnSafetyBackups: $("btnSafetyBackups"),
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
    btnPasteFormatted: $("btnPasteFormatted"),
    btnPastePlain: $("btnPastePlain"),
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
    safetyModal: $("safetyModal"),
    btnCloseSafety: $("btnCloseSafety"),
    safetyBackupList: $("safetyBackupList"),
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

export function setHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle("is-hidden", hidden);
}

export function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

export function makeButton(label, className, action, title = label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.dataset.action = action;
    button.title = title;
    return button;
}

export function renderVersion() {
    elements.versionDisplay.textContent = `${APP_CONFIG.version} / ${APP_CONFIG.lastUpdated}`;
    elements.modeBadge.textContent = "TEST MODE";
}

export function renderStorageGuard(productionStorageSnapshot) {
    const changedKeys = Object.entries(productionStorageSnapshot)
        .filter(([, value]) => value !== null)
        .map(([key]) => key);

    elements.productionStorageState.textContent = changedKeys.length
        ? `운영 키 감지됨: ${changedKeys.join(", ")} (테스트 앱은 읽기/쓰기 안 함)`
        : "운영 localStorage 키 없음. 테스트 저장소만 사용 중";
}
