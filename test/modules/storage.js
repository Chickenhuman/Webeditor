import {
    DEFAULT_SETTINGS,
    PRODUCTION_STORAGE_KEYS,
    SAMPLE_CHARACTERS,
    SAMPLE_LIBRARY,
    STORAGE_KEYS,
    cloneData,
} from "./config.js";

export function loadJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return cloneData(fallback);

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`Invalid JSON in ${key}; using fallback`, error);
        return cloneData(fallback);
    }
}

export function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

export function getProductionStorageSnapshot() {
    return Object.fromEntries(PRODUCTION_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

export function hasTestData() {
    return Boolean(localStorage.getItem(STORAGE_KEYS.library));
}

export function seedTestData(force = false) {
    if (!force && hasTestData()) return;

    saveJson(STORAGE_KEYS.library, SAMPLE_LIBRARY);
    saveJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    saveJson(STORAGE_KEYS.characters, SAMPLE_CHARACTERS);
    saveJson(STORAGE_KEYS.snapshots, []);
    localStorage.setItem(STORAGE_KEYS.lastUpdated, new Date().toISOString());
    saveJson(STORAGE_KEYS.lastActive, {
        novelId: SAMPLE_LIBRARY[0].id,
        chapterId: SAMPLE_LIBRARY[0].chapters[0].id,
    });
}

export function loadTestState() {
    seedTestData();

    return {
        library: loadJson(STORAGE_KEYS.library, SAMPLE_LIBRARY),
        settings: { ...DEFAULT_SETTINGS, ...loadJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS) },
        characters: loadJson(STORAGE_KEYS.characters, SAMPLE_CHARACTERS),
        lastActive: loadJson(STORAGE_KEYS.lastActive, null),
    };
}

export function saveLibrary(library) {
    saveJson(STORAGE_KEYS.library, library);
    localStorage.setItem(STORAGE_KEYS.lastUpdated, new Date().toISOString());
}

export function saveSettings(settings) {
    saveJson(STORAGE_KEYS.settings, settings);
}

export function saveCharacters(characters) {
    saveJson(STORAGE_KEYS.characters, characters);
}

export function saveLastActive(lastActive) {
    saveJson(STORAGE_KEYS.lastActive, lastActive);
}

export function resetTestData() {
    seedTestData(true);
    return loadTestState();
}
