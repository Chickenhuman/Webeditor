import { APP_CONFIG, MESSAGES, createId } from "./config.js";
import {
    createPasswordLock,
    isNovelLocked,
    migrateLegacyPasswordLock,
    verifyNovelPassword,
} from "./password.js";
import { sanitizeHtml, toSafeText } from "./sanitize.js";

export function createLibraryController({
    elements,
    getLibrary,
    setLibrary,
    persistLocalState,
    saveLastActive,
    makeButton,
    setHidden,
    showToast,
    editorController,
    performSave,
    updateSavedIndicator,
}) {
    let currentNovelId = null;
    let currentChapterId = null;
    let viewMode = "library";
    let draggedChapterId = null;

    function getCurrentNovel() {
        return getLibrary().find((novel) => novel.id === currentNovelId) || null;
    }

    function getCurrentChapter() {
        const novel = getCurrentNovel();
        return novel?.chapters.find((chapter) => chapter.id === currentChapterId) || null;
    }

    function getLastActive() {
        if (!currentNovelId || !currentChapterId) return null;
        return { novelId: currentNovelId, chapterId: currentChapterId };
    }

    function getViewMode() {
        return viewMode;
    }

    function renderLibrary() {
        const library = getLibrary();
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
            label.textContent = `${isNovelLocked(novel) ? "🔒" : "📘"} ${novel.title}`;

            const actions = document.createElement("span");
            actions.className = "item-actions";
            actions.append(
                makeButton(isNovelLocked(novel) ? "해제" : "잠금", "mini-btn", "toggle-lock"),
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

    async function createNovel(title) {
        const novel = {
            id: createId("novel"),
            title: toSafeText(title),
            memo: "",
            chapters: [
                {
                    id: createId("chapter"),
                    title: APP_CONFIG.defaultChapterTitle,
                    content: "",
                },
            ],
        };

        getLibrary().push(novel);
        currentNovelId = novel.id;
        currentChapterId = novel.chapters[0].id;
        persistLocalState();
        await openNovel(novel.id, { skipLock: true });
    }

    async function promptCreateNovel() {
        const title = window.prompt("테스트 소설 제목", APP_CONFIG.defaultNovelTitle);
        if (title?.trim()) await createNovel(toSafeText(title.trim()));
    }

    async function deleteNovel(id) {
        if (!window.confirm("선택한 테스트 소설을 삭제할까요?")) return;
        const nextLibrary = getLibrary().filter((novel) => novel.id !== id);
        setLibrary(nextLibrary);
        if (!nextLibrary.length) {
            await createNovel(APP_CONFIG.defaultNovelTitle);
            return;
        }
        persistLocalState();
        renderLibrary();
    }

    async function openNovel(id, options = {}) {
        const novel = getLibrary().find((item) => item.id === id);
        if (!novel) return;

        if (isNovelLocked(novel) && !options.skipLock) {
            const input = window.prompt(MESSAGES.lockedNovelPrompt);
            if (input === null) {
                renderLibrary();
                return;
            }
            if (!(await verifyNovelPassword(novel, input))) {
                showToast("비밀번호가 일치하지 않습니다.");
                renderLibrary();
                return;
            }
            if (await migrateLegacyPasswordLock(novel)) persistLocalState();
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
        elements.memoTextarea.value = toSafeText(novel.memo);
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

        if (editorController.isHtmlModeActive()) editorController.setHtmlMode(false);
        currentChapterId = id;
        const safeContent = sanitizeHtml(chapter.content);
        chapter.content = safeContent;
        elements.titleInput.value = toSafeText(chapter.title);
        elements.editor.innerHTML = safeContent;
        elements.htmlEditor.value = safeContent;
        editorController.resetHistory();
        updateSavedIndicator(MESSAGES.ready);
        editorController.updateCount();
        saveLastActive(getLastActive());
        renderNovelSidebar();
    }

    function switchChapter(id) {
        performSave();
        loadChapter(id);
    }

    async function toggleLock(id) {
        const novel = getLibrary().find((item) => item.id === id);
        if (!novel) return;

        if (isNovelLocked(novel)) {
            const input = window.prompt(MESSAGES.lockedNovelPrompt);
            if (await verifyNovelPassword(novel, input)) {
                delete novel.password;
                delete novel.passwordLock;
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

        novel.passwordLock = await createPasswordLock(password);
        delete novel.password;
        persistLocalState();
        renderLibrary();
        showToast("테스트 잠금이 설정되었습니다.");
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const content = sanitizeHtml(String(reader.result).replace(/\n/g, "<br>"));
            const novel = getCurrentNovel();
            if (!novel) return;
            novel.chapters.push({
                id: createId("chapter"),
                title: toSafeText(file.name.replace(/\.(txt|docx)$/i, "")),
                content,
            });
            persistLocalState();
            loadChapter(novel.chapters.at(-1).id);
            event.target.value = "";
        };
        reader.readAsText(file);
    }

    async function handleSidebarClick(event) {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;
        const item = actionButton.closest("[data-id]");
        const id = item?.dataset.id || actionButton.dataset.id;
        const action = actionButton.dataset.action;

        if (action === "open-novel") await openNovel(id);
        if (action === "delete-novel") await deleteNovel(id);
        if (action === "toggle-lock") await toggleLock(id);
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
        elements.sidebarActionBtn.addEventListener("click", async () => {
            if (viewMode === "library") await promptCreateNovel();
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
        elements.fileInput.addEventListener("change", handleFileSelect);
    }

    return {
        bindEvents,
        createNovel,
        getCurrentChapter,
        getCurrentNovel,
        getLastActive,
        getViewMode,
        openNovel,
        renderLibrary,
    };
}
