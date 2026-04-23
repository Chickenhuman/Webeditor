import {
    APP_CONFIG,
    DEFAULT_SETTINGS,
    MESSAGES,
} from "./modules/config.js";
import { createCloudMock } from "./modules/cloud.mock.js";
import {
    getProductionStorageSnapshot,
    deleteSafetyBackup,
    loadSafetyBackups,
    loadTestState,
    resetTestData,
    saveCharacters,
    saveLastActive,
    saveLibrary,
    saveSafetyBackup,
    saveSettings,
} from "./modules/storage.js";
import {
    sanitizeCharacters,
    sanitizeHtml,
    sanitizeLibrary,
    toSafeText,
} from "./modules/sanitize.js";
import {
    migrateLibraryPasswordLocks,
} from "./modules/password.js";
import {
    elements,
    makeButton,
    renderStorageGuard,
    renderVersion,
    setHidden,
    showToast,
} from "./modules/dom.js";
import { backupTestState, downloadNovel } from "./modules/downloads.js";
import { createCharacterController } from "./modules/characters.ui.js";
import { createEditorController } from "./modules/editor.controller.js";
import { createLibraryController } from "./modules/library.controller.js";
import { createSettingsController } from "./modules/settings.controller.js";
import { createSnapshotController } from "./modules/snapshots.ui.js";

const cloud = createCloudMock();
const initialState = normalizeState(loadTestState());

let library = initialState.library;
let settings = initialState.settings;
let characters = initialState.characters;
let currentUser = null;
let hasUnsavedChanges = false;
let characterController = null;
let editorController = null;
let libraryController = null;
let settingsController = null;
let snapshotController = null;

function normalizeState(state) {
    return {
        ...state,
        library: sanitizeLibrary(state.library),
        characters: sanitizeCharacters(state.characters),
    };
}

function getCurrentNovel() {
    return libraryController?.getCurrentNovel() || null;
}

function getCurrentChapter() {
    return libraryController?.getCurrentChapter() || null;
}

function getLastActive() {
    return libraryController?.getLastActive() || null;
}

function persistLocalState() {
    library = sanitizeLibrary(library);
    characters = sanitizeCharacters(characters);
    saveLibrary(library);
    saveSettings(settings);
    saveCharacters(characters);
    const lastActive = getLastActive();
    if (lastActive) saveLastActive(lastActive);
}

function setLibraryState(nextLibrary) {
    library = sanitizeLibrary(nextLibrary);
}

function setSettingsState(nextSettings) {
    settings = { ...DEFAULT_SETTINGS, ...nextSettings };
}

function setCharactersState(nextCharacters) {
    characters = sanitizeCharacters(nextCharacters);
}

function getSnapshotState() {
    return {
        library,
        settings,
        characters,
        lastActive: getLastActive(),
    };
}

function createSafetyBackup(reason) {
    const novel = getCurrentNovel();
    const chapter = getCurrentChapter();

    if (novel && chapter) {
        editorController.syncFromHtmlMode();
        chapter.title = toSafeText(elements.titleInput.value.trim() || "무제");
        chapter.content = sanitizeHtml(elements.editor.innerHTML);
        elements.editor.innerHTML = chapter.content;
        elements.htmlEditor.value = chapter.content;
        novel.memo = toSafeText(elements.memoTextarea.value);
    }

    persistLocalState();
    return saveSafetyBackup(reason, getSnapshotState());
}

function applyRestoredState(restoredState) {
    const restoredLibrary = sanitizeLibrary(restoredState.library);
    const restoredSettings = { ...DEFAULT_SETTINGS, ...(restoredState.settings || {}) };
    const restoredCharacters = sanitizeCharacters(restoredState.characters || []);

    library = restoredLibrary;
    settings = restoredSettings;
    characters = restoredCharacters;
    persistLocalState();
    if (restoredState.lastActive) saveLastActive(restoredState.lastActive);
    settingsController.applySettings();
    editorController.renderSymbols();
    return restoredState.lastActive || null;
}

function renderSafetyBackups() {
    const backups = loadSafetyBackups();
    elements.safetyBackupList.replaceChildren();

    if (!backups.length) {
        const empty = document.createElement("p");
        empty.className = "empty-message";
        empty.textContent = "저장된 안전 백업이 없습니다.";
        elements.safetyBackupList.appendChild(empty);
        return;
    }

    backups.forEach((backup) => {
        const item = document.createElement("article");
        item.className = "history-item";

        const info = document.createElement("div");
        info.className = "history-info";
        const date = document.createElement("strong");
        date.textContent = new Date(backup.savedAt).toLocaleString();
        const summary = document.createElement("span");
        const novelCount = backup.data?.library?.length || 0;
        summary.textContent = `${backup.reason} / 소설 ${novelCount}개`;
        info.append(date, summary);

        const actions = document.createElement("div");
        actions.className = "history-actions";
        const restoreButton = makeButton("복원", "btn-tool small", "restore-safety-backup");
        const deleteButton = makeButton("삭제", "btn-tool small danger", "delete-safety-backup");
        restoreButton.dataset.id = backup.id;
        deleteButton.dataset.id = backup.id;
        actions.append(restoreButton, deleteButton);

        item.append(info, actions);
        elements.safetyBackupList.appendChild(item);
    });
}

async function restoreSafetyBackup(id) {
    if (!window.confirm("선택한 안전 백업으로 테스트 데이터를 복원할까요?")) return;
    const backup = loadSafetyBackups().find((item) => item.id === id);
    if (!backup?.data?.library) {
        showToast("안전 백업을 찾지 못했습니다.");
        return;
    }

    const lastActive = applyRestoredState(backup.data);
    elements.safetyModal.classList.remove("open");
    if (lastActive?.novelId) {
        await libraryController.openNovel(lastActive.novelId, { chapterId: lastActive.chapterId, skipLock: true });
    } else {
        libraryController.renderLibrary();
    }
    showToast("안전 백업이 복원되었습니다.");
}

function openSafetyBackups() {
    renderSafetyBackups();
    elements.safetyModal.classList.add("open");
}

function initControllers() {
    editorController = createEditorController({
        elements,
        getSettings: () => settings,
        saveSettings,
        setHidden,
        showToast,
        markAsUnsaved,
    });

    libraryController = createLibraryController({
        elements,
        getLibrary: () => library,
        setLibrary: setLibraryState,
        persistLocalState,
        saveLastActive,
        makeButton,
        setHidden,
        showToast,
        editorController,
        performSave,
        updateSavedIndicator,
        createSafetyBackup,
    });

    settingsController = createSettingsController({
        elements,
        getSettings: () => settings,
        saveSettings,
        shouldAutoSave: () => hasUnsavedChanges,
        performSave,
    });

    characterController = createCharacterController({
        elements,
        getCharacters: () => characters,
        setCharacters: setCharactersState,
        saveCharacters,
        setHidden,
        showToast,
        performSave,
    });

    snapshotController = createSnapshotController({
        cloud,
        elements,
        getSnapshotState,
        performSave,
        makeButton,
        showToast,
        persistLocalState,
        applySettings: settingsController.applySettings,
        renderSymbols: () => editorController.renderSymbols(),
        renderLibrary: libraryController.renderLibrary,
        openNovel: libraryController.openNovel,
        setLibrary: setLibraryState,
        setSettings: setSettingsState,
        setCharacters: setCharactersState,
        createSafetyBackup,
    });
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

function updateSavedIndicator(message = MESSAGES.ready) {
    hasUnsavedChanges = false;
    elements.unsavedDot.classList.remove("active");
    elements.lastSavedDisplay.textContent = message;
    elements.lastSavedDisplay.classList.remove("unsaved");
}

function updateSaveFailureIndicator() {
    hasUnsavedChanges = false;
    elements.unsavedDot.classList.remove("active");
    elements.lastSavedDisplay.textContent = MESSAGES.savedCloudFailed;
    elements.lastSavedDisplay.classList.add("unsaved");
}

function markAsUnsaved() {
    if (!hasUnsavedChanges) {
        hasUnsavedChanges = true;
        elements.unsavedDot.classList.add("active");
        elements.lastSavedDisplay.textContent = MESSAGES.unsaved;
        elements.lastSavedDisplay.classList.add("unsaved");
    }
    editorController?.updateCount();
}

async function performSave(options = {}) {
    const saveOptions = options?.type ? {} : options;
    const syncCloud = saveOptions.syncCloud !== false;

    if (libraryController.getViewMode() === "library") return;
    const novel = getCurrentNovel();
    const chapter = getCurrentChapter();
    if (!novel || !chapter) {
        showToast(MESSAGES.noNovel);
        return;
    }

    editorController.syncFromHtmlMode();
    chapter.title = toSafeText(elements.titleInput.value.trim() || "무제");
    chapter.content = sanitizeHtml(elements.editor.innerHTML);
    elements.editor.innerHTML = chapter.content;
    elements.htmlEditor.value = chapter.content;
    novel.memo = toSafeText(elements.memoTextarea.value);
    persistLocalState();
    if (!syncCloud) {
        updateSavedIndicator(MESSAGES.savedLocal);
        return;
    }

    elements.unsavedDot.classList.remove("active");
    elements.lastSavedDisplay.textContent = MESSAGES.savingCloud;
    elements.lastSavedDisplay.classList.remove("unsaved");

    try {
        await syncMockCloud();
    } catch (error) {
        console.warn("Mock cloud save failed", error);
        updateSaveFailureIndicator();
    }
}

function toggleMemoPanel() {
    elements.memoPanel.classList.toggle("open");
}

function downloadAll(format) {
    const novel = getCurrentNovel();
    if (!novel) return;
    performSave();
    downloadNovel(format, novel);
}

async function backupData() {
    await performSave({ syncCloud: false });
    backupTestState({
        library,
        settings,
        characters,
        lastActive: getLastActive(),
    });
}

function restoreData(event) {
    const file = event.target.files[0];
    if (!file || !window.confirm(MESSAGES.backupRestoreConfirm)) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!data || !Array.isArray(data.library)) {
                throw new Error("Backup library must be an array.");
            }

            createSafetyBackup("backup-restore");
            applyRestoredState({
                library: data.library,
                settings: data.settings && typeof data.settings === "object" ? { ...settings, ...data.settings } : settings,
                characters: Array.isArray(data.characters) ? data.characters : characters,
                lastActive: data.lastActive,
            });
            libraryController.renderLibrary();
            showToast("테스트 백업 복원이 완료되었습니다.");
        } catch (error) {
            console.warn(error);
            showToast("백업 파일을 읽지 못했습니다.");
        } finally {
            event.target.value = "";
        }
    };
    reader.readAsText(file);
}

function bindEvents() {
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

    elements.btnSave.addEventListener("click", () => {
        void performSave();
    });
    elements.btnResetTestData.addEventListener("click", async () => {
        if (!window.confirm(MESSAGES.testDataResetConfirm)) return;
        const state = normalizeState(resetTestData());
        library = state.library;
        settings = state.settings;
        characters = state.characters;
        settingsController.applySettings();
        editorController.renderSymbols();
        await libraryController.openNovel(state.lastActive.novelId, { chapterId: state.lastActive.chapterId, skipLock: true });
        showToast("테스트 데이터가 초기화되었습니다.");
    });
    elements.btnMemo.addEventListener("click", toggleMemoPanel);
    elements.btnCloseMemo.addEventListener("click", toggleMemoPanel);
    elements.btnExportTxt.addEventListener("click", () => downloadAll("txt"));
    elements.btnExportDocx.addEventListener("click", () => downloadAll("docx"));
    elements.btnCharacters.addEventListener("click", characterController.openCharacterModal);
    elements.btnSnapshotSave.addEventListener("click", snapshotController.saveSnapshot);
    elements.btnSnapshots.addEventListener("click", snapshotController.openSnapshotList);
    elements.btnSafetyBackups.addEventListener("click", openSafetyBackups);
    elements.btnCloseSafety.addEventListener("click", () => elements.safetyModal.classList.remove("open"));
    elements.safetyBackupList.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;
        if (button.dataset.action === "restore-safety-backup") await restoreSafetyBackup(button.dataset.id);
        if (button.dataset.action === "delete-safety-backup") {
            deleteSafetyBackup(button.dataset.id);
            renderSafetyBackups();
        }
    });
    elements.btnBackup.addEventListener("click", () => {
        void backupData();
    });
    elements.btnFileOpen.addEventListener("click", () => elements.fileInput.click());
    elements.btnBackupRestore.addEventListener("click", () => elements.backupInput.click());
    elements.backupInput.addEventListener("change", restoreData);

    elements.titleInput.addEventListener("input", markAsUnsaved);
    elements.memoTextarea.addEventListener("input", markAsUnsaved);

    libraryController.bindEvents();
    editorController.bindEvents();
    settingsController.bindEvents();
    snapshotController.bindEvents();
    characterController.bindEvents();

    window.addEventListener("beforeunload", (event) => {
        if (!hasUnsavedChanges) return undefined;
        event.preventDefault();
        event.returnValue = MESSAGES.unsaved;
        return MESSAGES.unsaved;
    });
}

async function init() {
    initControllers();
    bindEvents();
    currentUser = await cloud.signIn();
    if (await migrateLibraryPasswordLocks(library)) persistLocalState();
    elements.userInfoDisplay.textContent = `${currentUser.displayName}님 (Mock Cloud)`;
    renderVersion();
    renderStorageGuard(getProductionStorageSnapshot());
    settingsController.applySettings();
    editorController.renderSymbols();
    settingsController.startAutoSaveTimer();

    const lastActive = initialState.lastActive;
    const targetNovel = library.find((novel) => novel.id === lastActive?.novelId) || library[0];
    if (targetNovel) {
        await libraryController.openNovel(targetNovel.id, { chapterId: lastActive?.chapterId, skipLock: true });
    } else {
        await libraryController.createNovel(APP_CONFIG.defaultNovelTitle);
    }
    await syncMockCloud(MESSAGES.testModeReady);
    showToast(MESSAGES.testModeReady);
}

init().catch((error) => {
    console.error("Test app failed to initialize", error);
    showToast("테스트 앱 초기화 실패");
});
