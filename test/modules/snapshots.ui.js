import { DEFAULT_SETTINGS, MESSAGES, cloneData } from "./config.js";
import { sanitizeCharacters, sanitizeLibrary } from "./sanitize.js";

export function createSnapshotController({
    cloud,
    elements,
    getSnapshotState,
    performSave,
    makeButton,
    showToast,
    persistLocalState,
    applySettings,
    renderSymbols,
    renderLibrary,
    openNovel,
    setLibrary,
    setSettings,
    setCharacters,
    createSafetyBackup = () => {},
}) {
    async function saveSnapshot() {
        if (!window.confirm(MESSAGES.snapshotSaveConfirm)) return;
        await performSave();
        await cloud.saveSnapshot(getSnapshotState());
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

        createSafetyBackup("snapshot-restore");
        const library = sanitizeLibrary(cloneData(snapshot.data.library));
        const settings = { ...DEFAULT_SETTINGS, ...cloneData(snapshot.data.settings) };
        const characters = sanitizeCharacters(cloneData(snapshot.data.characters));
        setLibrary(library);
        setSettings(settings);
        setCharacters(characters);
        persistLocalState();
        applySettings();
        renderSymbols();
        elements.historyModal.classList.remove("open");
        const lastActive = snapshot.data.lastActive;
        if (lastActive?.novelId) {
            await openNovel(lastActive.novelId, { chapterId: lastActive.chapterId, skipLock: true });
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

    function bindEvents() {
        elements.btnCloseHistory.addEventListener("click", () => elements.historyModal.classList.remove("open"));
        elements.snapshotList.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-action]");
            if (!button) return;
            if (button.dataset.action === "load-snapshot") await loadSnapshot(button.dataset.id);
            if (button.dataset.action === "delete-snapshot") await deleteSnapshot(button.dataset.id);
        });
    }

    return {
        bindEvents,
        openSnapshotList,
        saveSnapshot,
    };
}
