export const APP_CONFIG = {
    version: "Test Ver 1.0.0",
    lastUpdated: "Test Updated 2026.04.21",
    storagePrefix: "webeditor:test",
    defaultNovelTitle: "테스트 새 소설",
    defaultChapterTitle: "1화",
    autosaveFallbackMinutes: 3,
    maxSnapshots: 20,
    maxSafetyBackups: 10,
    maxHistory: 50,
};

export const STORAGE_KEYS = {
    library: `${APP_CONFIG.storagePrefix}:library`,
    settings: `${APP_CONFIG.storagePrefix}:settings`,
    characters: `${APP_CONFIG.storagePrefix}:characters`,
    snapshots: `${APP_CONFIG.storagePrefix}:snapshots`,
    safetyBackups: `${APP_CONFIG.storagePrefix}:safety-backups`,
    cloudState: `${APP_CONFIG.storagePrefix}:cloud-state`,
    cloudFailNextSync: `${APP_CONFIG.storagePrefix}:cloud-fail-next-sync`,
    lastActive: `${APP_CONFIG.storagePrefix}:last-active`,
    lastUpdated: `${APP_CONFIG.storagePrefix}:last-updated`,
};

export const PRODUCTION_STORAGE_KEYS = [
    "novelLibrary",
    "editorSettings",
    "characterList",
    "editorLastActive",
    "localLastUpdated",
];

export const DEFAULT_SYMBOLS = "「」, 『』, (), [], “”, ─, …, ★, ※";

export const DEFAULT_SETTINGS = {
    darkMode: false,
    autoSaveMin: APP_CONFIG.autosaveFallbackMinutes,
    targetCount: 5000,
    goalType: "space",
    customSymbols: DEFAULT_SYMBOLS,
};

export const MOCK_USER = {
    uid: "mock-user-webeditor-test",
    displayName: "테스트 작가",
    email: "test-user@mock.local",
};

export const MESSAGES = {
    testModeReady: "테스트 모드 준비 완료",
    savedLocal: "저장됨(Test Local)",
    savedCloud: "저장됨(Mock Cloud)",
    savingCloud: "Mock Cloud 저장 중...",
    savedCloudFailed: "Mock Cloud 저장 실패(Test Local 보존)",
    unsaved: "저장 안됨",
    ready: "준비됨",
    noNovel: "저장할 소설이 선택되지 않았습니다.",
    minChapter: "최소 1개 챕터는 필요합니다.",
    replaceConfirm: "현재 챕터의 모든 일치 항목을 변경할까요?",
    replaceDone: "바꾸기가 완료되었습니다.",
    replaceNone: "일치하는 내용이 없습니다.",
    backupRestoreConfirm: "테스트 데이터를 백업 파일 내용으로 덮어쓸까요?",
    snapshotSaveConfirm: "현재 테스트 상태를 mock 스냅샷으로 저장할까요?",
    snapshotLoadConfirm: "선택한 mock 스냅샷으로 테스트 데이터를 복원할까요?",
    snapshotDeleteConfirm: "선택한 mock 스냅샷을 삭제할까요?",
    testDataResetConfirm: "테스트 전용 데이터를 샘플 상태로 초기화할까요?",
    lockedNovelPrompt: "잠긴 테스트 소설입니다. 비밀번호를 입력하세요.",
    lockPasswordPrompt: "설정할 테스트 비밀번호를 입력하세요.",
    lockPasswordConfirmPrompt: "비밀번호 확인을 위해 한 번 더 입력하세요.",
};

export const SAMPLE_LIBRARY = [
    {
        id: "sample-novel-1",
        title: "샘플 판타지 원고",
        memo: "세계관: 바람을 기록하는 왕국. 테스트 전용 메모입니다.",
        chapters: [
            {
                id: "sample-chapter-1",
                title: "1화 - 바람의 서문",
                content: "바람은 오래된 잉크 냄새를 품고 있었다.<br>그날, 기록관은 첫 문장을 다시 썼다.",
            },
            {
                id: "sample-chapter-2",
                title: "2화 - 낡은 지도",
                content: "지도 위의 빈칸은 도시보다 넓었다.<br>소년은 그곳에 자신의 이름을 적었다.",
            },
        ],
    },
    {
        id: "sample-novel-2",
        title: "샘플 잠금 원고",
        memo: "잠금 흐름 검증용입니다. 비밀번호는 1234입니다. 저장값은 hash 잠금입니다.",
        passwordLock: {
            version: 1,
            algorithm: "SHA-256",
            salt: "webeditor-test-sample-lock-v1",
            hash: "cce0f77b342811c526664f00752a44761d0f259d6b5638cd527ad5ed9dd676d7",
        },
        chapters: [
            {
                id: "sample-chapter-locked-1",
                title: "잠긴 1화",
                content: "비밀번호 입력 흐름을 검증하기 위한 테스트 챕터입니다.",
            },
        ],
    },
];

export const SAMPLE_CHARACTERS = [
    {
        id: "sample-character-1",
        name: "이서",
        age: "24세 / 여",
        role: "기록관",
        appearance: "짧은 검은 머리와 푸른 잉크가 묻은 손.",
        personality: "차분하지만 중요한 문장 앞에서는 물러서지 않는다.",
    },
    {
        id: "sample-character-2",
        name: "하린",
        age: "19세 / 남",
        role: "지도 제작자",
        appearance: "낡은 망원경을 목에 걸고 다닌다.",
        personality: "농담이 많지만 길을 잃은 사람을 그냥 지나치지 못한다.",
    },
];

export function cloneData(value) {
    if (typeof structuredClone === "function") {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
}

export function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now()}-${random}`;
}
