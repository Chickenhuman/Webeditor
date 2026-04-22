import {
    APP_CONFIG,
    DEFAULT_SETTINGS,
    MESSAGES,
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
import { createSnapshotController } from "./modules/snapshots.ui.js";

const cloud = createCloudMock();
const initialState = normalizeState(loadTestState());

let library = initialState.library;
let settings = initialState.settings;
let characters = initialState.characters;
let currentUser = null;
let hasUnsavedChanges = false;
let autoSaveTimerId = null;
let characterController = null;
let editorController = null;
let libraryController = null;
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
        applySettings,
        renderSymbols: () => editorController.renderSymbols(),
        renderLibrary: libraryController.renderLibrary,
        openNovel: libraryController.openNovel,
        setLibrary: setLibraryState,
        setSettings: setSettingsState,
        setCharacters: setCharactersState,
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
    editorController?.updateCount();
}

function performSave() {
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
    updateSavedIndicator(MESSAGES.savedLocal);
    syncMockCloud().catch((error) => console.error("Mock cloud save failed", error));
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

function backupData() {
    performSave();
    backupTestState({
        library,
        settings,
        characters,
    });
}

function restoreData(event) {
    const file = event.target.files[0];
    if (!file || !window.confirm(MESSAGES.backupRestoreConfirm)) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            library = Array.isArray(data.library) ? sanitizeLibrary(data.library) : library;
            settings = { ...settings, ...(data.settings || {}) };
            characters = Array.isArray(data.characters) ? sanitizeCharacters(data.characters) : characters;
            persistLocalState();
            applySettings();
            editorController.renderSymbols();
            libraryController.renderLibrary();
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

    elements.btnSave.addEventListener("click", performSave);
    elements.btnResetTestData.addEventListener("click", async () => {
        if (!window.confirm(MESSAGES.testDataResetConfirm)) return;
        const state = normalizeState(resetTestData());
        library = state.library;
        settings = state.settings;
        characters = state.characters;
        applySettings();
        editorController.renderSymbols();
        await libraryController.openNovel(state.lastActive.novelId, { chapterId: state.lastActive.chapterId, skipLock: true });
        showToast("테스트 데이터가 초기화되었습니다.");
    });

    elements.btnSettings.addEventListener("click", (event) => {
        event.stopPropagation();
        elements.settingsPopup.classList.toggle("open");
    });
    elements.settingsPopup.addEventListener("click", (event) => event.stopPropagation());
    document.addEventListener("click", () => elements.settingsPopup.classList.remove("open"));
    elements.btnMemo.addEventListener("click", toggleMemoPanel);
    elements.btnCloseMemo.addEventListener("click", toggleMemoPanel);
    elements.btnExportTxt.addEventListener("click", () => downloadAll("txt"));
    elements.btnExportDocx.addEventListener("click", () => downloadAll("docx"));
    elements.btnCharacters.addEventListener("click", characterController.openCharacterModal);
    elements.btnSnapshotSave.addEventListener("click", snapshotController.saveSnapshot);
    elements.btnSnapshots.addEventListener("click", snapshotController.openSnapshotList);
    elements.btnBackup.addEventListener("click", backupData);
    elements.btnTheme.addEventListener("click", () => {
        settings.darkMode = !settings.darkMode;
        saveSettings(settings);
        applySettings();
    });
    elements.btnFileOpen.addEventListener("click", () => elements.fileInput.click());
    elements.btnBackupRestore.addEventListener("click", () => elements.backupInput.click());
    elements.backupInput.addEventListener("change", restoreData);

    elements.titleInput.addEventListener("input", markAsUnsaved);
    elements.memoTextarea.addEventListener("input", markAsUnsaved);
    elements.autoSaveInput.addEventListener("change", startAutoSaveTimer);

    libraryController.bindEvents();
    editorController.bindEvents();
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
    applySettings();
    editorController.renderSymbols();
    startAutoSaveTimer();

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
