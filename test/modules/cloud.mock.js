import { APP_CONFIG, MOCK_USER, STORAGE_KEYS, cloneData, createId } from "./config.js";
import { loadJson, saveJson } from "./storage.js";

export function createCloudMock() {
    return {
        async signIn() {
            return cloneData(MOCK_USER);
        },

        async syncState(state) {
            const now = new Date().toISOString();
            const cloudState = {
                user: MOCK_USER,
                library: cloneData(state.library),
                settings: cloneData(state.settings),
                characters: cloneData(state.characters),
                lastActive: cloneData(state.lastActive),
                lastUpdated: now,
            };

            saveJson(STORAGE_KEYS.cloudState, cloudState);
            return cloudState;
        },

        async saveSnapshot(state) {
            const snapshots = loadJson(STORAGE_KEYS.snapshots, []);
            const now = new Date().toISOString();
            const snapshot = {
                id: createId("snapshot"),
                savedAt: now,
                summary: `소설 ${state.library.length}개 / ${state.library.reduce((sum, novel) => sum + novel.chapters.length, 0)}개 챕터`,
                data: {
                    library: cloneData(state.library),
                    settings: cloneData(state.settings),
                    characters: cloneData(state.characters),
                    lastActive: cloneData(state.lastActive),
                },
            };

            snapshots.unshift(snapshot);
            saveJson(STORAGE_KEYS.snapshots, snapshots.slice(0, APP_CONFIG.maxSnapshots));
            return snapshot;
        },

        async listSnapshots() {
            return loadJson(STORAGE_KEYS.snapshots, []);
        },

        async loadSnapshot(id) {
            const snapshots = loadJson(STORAGE_KEYS.snapshots, []);
            return snapshots.find((snapshot) => snapshot.id === id) || null;
        },

        async deleteSnapshot(id) {
            const snapshots = loadJson(STORAGE_KEYS.snapshots, []);
            saveJson(STORAGE_KEYS.snapshots, snapshots.filter((snapshot) => snapshot.id !== id));
        },
    };
}
