import { APP_CONFIG, DEFAULT_SETTINGS } from "./config.js";

export function createSettingsController({
    elements,
    getSettings,
    saveSettings,
    shouldAutoSave,
    performSave,
}) {
    let autoSaveTimerId = null;

    function applySettings() {
        const settings = getSettings();
        document.body.classList.toggle("dark-mode", Boolean(settings.darkMode));
        elements.btnTheme.textContent = settings.darkMode ? "☀" : "☾";
        elements.autoSaveInput.value = settings.autoSaveMin || DEFAULT_SETTINGS.autoSaveMin;
        elements.targetCountInput.value = settings.targetCount || DEFAULT_SETTINGS.targetCount;
        elements.goalTypeSelect.value = settings.goalType || DEFAULT_SETTINGS.goalType;
    }

    function startAutoSaveTimer() {
        if (autoSaveTimerId) window.clearInterval(autoSaveTimerId);
        const settings = getSettings();
        const minutes = Number.parseInt(elements.autoSaveInput.value, 10) || APP_CONFIG.autosaveFallbackMinutes;
        settings.autoSaveMin = minutes;
        saveSettings(settings);
        autoSaveTimerId = window.setInterval(() => {
            if (shouldAutoSave()) performSave();
        }, minutes * 60 * 1000);
    }

    function toggleSettingsPopup(event) {
        event.stopPropagation();
        elements.settingsPopup.classList.toggle("open");
    }

    function bindEvents() {
        elements.btnSettings.addEventListener("click", toggleSettingsPopup);
        elements.settingsPopup.addEventListener("click", (event) => event.stopPropagation());
        document.addEventListener("click", () => elements.settingsPopup.classList.remove("open"));
        elements.autoSaveInput.addEventListener("change", startAutoSaveTimer);
        elements.btnTheme.addEventListener("click", () => {
            const settings = getSettings();
            settings.darkMode = !settings.darkMode;
            saveSettings(settings);
            applySettings();
        });
    }

    return {
        applySettings,
        bindEvents,
        startAutoSaveTimer,
    };
}
