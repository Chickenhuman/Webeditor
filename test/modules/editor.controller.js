import { APP_CONFIG, DEFAULT_SETTINGS, MESSAGES } from "./config.js";
import { sanitizeHtml } from "./sanitize.js";

export function createEditorController({
    elements,
    getSettings,
    saveSettings,
    setHidden,
    showToast,
    markAsUnsaved,
}) {
    let isHtmlMode = false;
    let historyDebounceTimer = null;
    let undoStack = [];
    let redoStack = [];

    function isHtmlModeActive() {
        return isHtmlMode;
    }

    function resetHistory() {
        undoStack = [];
        redoStack = [];
    }

    function updateCount() {
        const text = elements.editor.textContent || "";
        const countWithSpace = text.length;
        const countNoSpace = text.replace(/\s/g, "").length;
        elements.charCount.textContent = String(countWithSpace);
        elements.charCountNoSpace.textContent = String(countNoSpace);
        updateGoalProgress(countWithSpace, countNoSpace);
    }

    function updateGoalProgress(
        countWithSpace = Number(elements.charCount.textContent),
        countNoSpace = Number(elements.charCountNoSpace.textContent),
    ) {
        const target = Math.max(
            Number.parseInt(elements.targetCountInput.value, 10) || DEFAULT_SETTINGS.targetCount,
            1,
        );
        const current = elements.goalTypeSelect.value === "nospace" ? countNoSpace : countWithSpace;
        const cappedPercent = Math.min((current / target) * 100, 100);
        elements.goalProgressBar.style.width = `${cappedPercent}%`;
        elements.goalPercentage.textContent = `${Math.floor((current / target) * 100)}%`;
    }

    function recordHistory() {
        const content = isHtmlMode ? sanitizeHtml(elements.htmlEditor.value) : sanitizeHtml(elements.editor.innerHTML);
        if (undoStack.at(-1) === content) return;
        undoStack.push(content);
        if (undoStack.length > APP_CONFIG.maxHistory) undoStack.shift();
        redoStack = [];
    }

    function applyHistoryContent(content) {
        const safeContent = sanitizeHtml(content);
        if (isHtmlMode) {
            elements.htmlEditor.value = safeContent;
        } else {
            elements.editor.innerHTML = safeContent;
        }
        markAsUnsaved();
        updateCount();
    }

    function performUndo() {
        if (!undoStack.length) return;
        redoStack.push(isHtmlMode ? sanitizeHtml(elements.htmlEditor.value) : sanitizeHtml(elements.editor.innerHTML));
        applyHistoryContent(undoStack.pop());
    }

    function performRedo() {
        if (!redoStack.length) return;
        undoStack.push(isHtmlMode ? sanitizeHtml(elements.htmlEditor.value) : sanitizeHtml(elements.editor.innerHTML));
        applyHistoryContent(redoStack.pop());
    }

    function syncFromHtmlMode() {
        if (!isHtmlMode) return;
        const safeHtml = sanitizeHtml(elements.htmlEditor.value);
        elements.htmlEditor.value = safeHtml;
        elements.editor.innerHTML = safeHtml;
    }

    function setHtmlMode(enabled) {
        isHtmlMode = enabled;
        if (isHtmlMode) {
            elements.htmlEditor.value = sanitizeHtml(elements.editor.innerHTML);
            setHidden(elements.editor, true);
            setHidden(elements.htmlEditor, false);
            elements.btnHtmlMode.classList.add("active");
            return;
        }

        const safeHtml = sanitizeHtml(elements.htmlEditor.value);
        elements.htmlEditor.value = safeHtml;
        elements.editor.innerHTML = safeHtml;
        setHidden(elements.htmlEditor, true);
        setHidden(elements.editor, false);
        elements.btnHtmlMode.classList.remove("active");
        updateCount();
    }

    function renderSymbols() {
        elements.symbolGroup.replaceChildren();
        const symbols = (getSettings().customSymbols || DEFAULT_SETTINGS.customSymbols)
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

    function pasteClipboardContent(event) {
        if (isHtmlMode) return;

        const clipboard = event.clipboardData || window.clipboardData;
        if (!clipboard) return;

        const html = clipboard.getData("text/html");
        const text = clipboard.getData("text/plain");
        const safeHtml = html ? sanitizeHtml(html) : "";
        const content = safeHtml || text;
        if (!content) return;

        event.preventDefault();
        recordHistory();
        document.execCommand(safeHtml ? "insertHTML" : "insertText", false, content);
        markAsUnsaved();
    }

    function executeFormatCommand(command) {
        if (isHtmlMode) return;
        recordHistory();
        document.execCommand(command, false, null);
        elements.editor.focus();
        markAsUnsaved();
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

        const before = sanitizeHtml(elements.editor.innerHTML);
        const after = sanitizeHtml(before.split(find).join(replace));
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
        const before = sanitizeHtml(elements.editor.innerHTML);
        const after = sanitizeHtml(before.replace(pattern, `.${lineBreak}`));

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

    function saveSymbols() {
        const settings = getSettings();
        settings.customSymbols = elements.symbolInput.value;
        saveSettings(settings);
        renderSymbols();
        elements.symbolEditModal.classList.remove("open");
        showToast("기호 설정이 저장되었습니다.");
    }

    function saveTargetCount() {
        const settings = getSettings();
        settings.targetCount = Number.parseInt(elements.targetCountInput.value, 10) || DEFAULT_SETTINGS.targetCount;
        saveSettings(settings);
        updateGoalProgress();
    }

    function saveGoalType() {
        const settings = getSettings();
        settings.goalType = elements.goalTypeSelect.value;
        saveSettings(settings);
        updateGoalProgress();
    }

    function bindEvents() {
        elements.btnRunLineBreak.addEventListener("click", autoLineBreak);
        elements.btnHtmlMode.addEventListener("click", () => setHtmlMode(!isHtmlMode));
        elements.formatToolbar.addEventListener("click", (event) => {
            const commandButton = event.target.closest("[data-command]");
            if (commandButton) executeFormatCommand(commandButton.dataset.command);
        });
        elements.symbolGroup.addEventListener("click", (event) => {
            const button = event.target.closest(".btn-symbol");
            if (button) insertSymbol(button.dataset.open, button.dataset.close);
        });
        elements.btnSymbolEditor.addEventListener("click", () => {
            elements.symbolInput.value = getSettings().customSymbols || DEFAULT_SETTINGS.customSymbols;
            elements.symbolEditModal.classList.add("open");
        });
        elements.btnCloseSymbolEditor.addEventListener("click", () => elements.symbolEditModal.classList.remove("open"));
        elements.btnSaveSymbols.addEventListener("click", saveSymbols);
        elements.btnSearch.addEventListener("click", toggleSearchModal);
        elements.btnCloseSearch.addEventListener("click", toggleSearchModal);
        elements.btnReplaceAll.addEventListener("click", findAndReplace);
        elements.editor.addEventListener("input", markAsUnsaved);
        elements.editor.addEventListener("beforeinput", () => {
            if (!historyDebounceTimer) recordHistory();
            window.clearTimeout(historyDebounceTimer);
            historyDebounceTimer = window.setTimeout(() => {
                historyDebounceTimer = null;
            }, 1000);
        });
        elements.editor.addEventListener("paste", pasteClipboardContent);
        elements.htmlEditor.addEventListener("input", markAsUnsaved);
        elements.targetCountInput.addEventListener("input", saveTargetCount);
        elements.goalTypeSelect.addEventListener("change", saveGoalType);

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
    }

    return {
        bindEvents,
        isHtmlModeActive,
        renderSymbols,
        resetHistory,
        setHtmlMode,
        syncFromHtmlMode,
        updateCount,
        updateGoalProgress,
    };
}
