const APP_VERSION = "Ver 1.1.6";
const LAST_UPDATED = "Updated 2026.01.09";

// 버전업데이트로직: 소규모 패치 -> 0.0.1씩 상승, 적당한 규모 패치 0.1.0 상승, 0.9에서 소규모 패치 추가 -> 0.0.9 -> 0.1.0 , 
// 개혁수준의 대규모패치 -> 1.0.0 상승

// ============================================================
// [1] Firebase SDK 설정
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBXra3sW5xB7chXd700odnr1i_8HVMJLrc",
  authDomain: "webtexteditor-c0536.firebaseapp.com",
  projectId: "webtexteditor-c0536",
  storageBucket: "webtexteditor-c0536.firebasestorage.app",
  messagingSenderId: "724618911088",
  appId: "1:724618911088:web:6435251f2fa6c6d93783b5",
  measurementId: "G-QRGF134DYV"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

const DOMAIN = "@private.user";
const SAFETY_BACKUP_KEY = 'editorSafetyBackups';
const MAX_SAFETY_BACKUPS = 10;
const PASSWORD_LOCK_VERSION = 1;
const defaultSettings = {
    darkMode: false,
    autoSaveMin: 3,
    targetCount: 5000,
    goalType: 'space',
    customSymbols: "「」, 『』, (), [], “”, ─, …, ★, ※"
};

// ============================================================
// [2] 전역 변수
// ============================================================
let library = readStoredJson('novelLibrary', []);
let currentNovelId = null;
let currentChapterId = null;

/* ▼▼▼ 아래 코드를 여기에 붙여넣으세요 ▼▼▼ */
const defaultSymbols = defaultSettings.customSymbols;
let settings = { ...defaultSettings, ...readStoredJson('editorSettings', {}) };
/* ▲▲▲ 여기까지 ▲▲▲ */

const MAX_HISTORY = 50;
let undoStack = [], redoStack = [];
let historyDebounceTimer = null;
let autoSaveTimerId = null;
let hasUnsavedChanges = false;
let isHtmlMode = false;
let pendingPasteMode = 'rich';
let viewMode = 'library';
let currentUser = null;
let isLoginMode = true; 
/* ▼▼▼ 전역 변수 영역에 추가 ▼▼▼ */
let characterList = readStoredJson('characterList', []); // 캐릭터 데이터
let selectedCharId = null; // 현재 선택된 캐릭터 ID

// DOM Elements
const loginOverlay = document.getElementById('loginOverlay');
const authTitle = document.getElementById('authTitle');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const nicknameInput = document.getElementById('nicknameInput');
const loginMessage = document.getElementById('loginMessage');
const btnAuthAction = document.getElementById('btnAuthAction');
const btnToggleMode = document.getElementById('btnToggleMode');
const toggleText = document.getElementById('toggleText');
const signupFields = document.getElementById('signupFields');
const signupConfirmField = document.getElementById('signupConfirmField');
const userInfoDisplay = document.getElementById('userInfoDisplay');
const btnLogout = document.getElementById('btnLogout');
const btnGuest = document.getElementById('btnGuest');

// [NEW] 모바일 메뉴 관련 요소
const btnMobileMenu = document.getElementById('btnMobileMenu');
const sidebar = document.querySelector('.sidebar'); // 클래스로 찾기
const mobileOverlay = document.getElementById('mobileOverlay');

// 안내창 요소
const btnShowInfo = document.getElementById('btnShowInfo');
const infoModal = document.getElementById('infoModal');
const btnCloseInfo = document.getElementById('btnCloseInfo');

// 에디터 요소
const titleInput = document.getElementById('titleInput');
const editorWrapper = document.getElementById('editorWrapper'); // [NEW] 에디터 전체 래퍼
const editor = document.getElementById('mainEditor');
const htmlEditor = document.getElementById('htmlSourceEditor');
const sidebarListEl = document.getElementById('sidebarList');
const sidebarTitle = document.getElementById('sidebarTitle');
const sidebarActionBtn = document.getElementById('sidebarActionBtn');
const sidebarStatus = document.getElementById('sidebarStatus');
const libraryHomeBtn = document.getElementById('libraryHomeBtn');
const charCountEl = document.getElementById('charCount');
const charCountNoSpaceEl = document.getElementById('charCountNoSpace');
const lastSavedDisplay = document.getElementById('lastSavedDisplay');
const unsavedDot = document.getElementById('unsavedDot');
const autoSaveInput = document.getElementById('autoSaveIntervalInput');
const fileInput = document.getElementById('fileInput');
const backupInput = document.getElementById('backupInput');
const targetCountInput = document.getElementById('targetCountInput');
const goalProgressBar = document.getElementById('goalProgressBar');
const goalPercentage = document.getElementById('goalPercentage');
const goalTypeSelect = document.getElementById('goalTypeSelect');
const memoPanel = document.getElementById('memoPanel');
const memoTextarea = document.getElementById('memoTextarea');
const searchModal = document.getElementById('searchModal');
const findInput = document.getElementById('findInput');
const replaceInput = document.getElementById('replaceInput');

const PASTE_ALLOWED_TAGS = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'COL', 'COLGROUP', 'DIV', 'EM', 'FONT',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN',
    'STRIKE', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR',
    'U', 'UL'
]);
const PASTE_DROP_WITH_CONTENT_TAGS = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE', 'TEMPLATE']);
const PASTE_ALLOWED_STYLE_PROPERTIES = [
    'border', 'border-bottom', 'border-collapse', 'border-color', 'border-left', 'border-right',
    'border-style', 'border-top', 'border-width', 'color', 'font-size', 'font-style',
    'font-weight', 'letter-spacing', 'line-height', 'text-align', 'text-decoration',
    'text-decoration-line', 'vertical-align', 'white-space'
];
const PASTE_UNSAFE_STYLE_VALUE = /(?:expression\s*\(|url\s*\(|javascript:|vbscript:|data:|@import|behavior\s*:|[<>])/i;
const PASTE_UNSAFE_STYLE_ATTRIBUTE_VALUE = /(?:expression\s*\(|url\s*\(|javascript:|vbscript:|data:|@import|behavior\s*:|[<>{};])/i;
const PASTE_FONT_SIZE_MAP = new Map([
    [1, '10px'],
    [2, '13px'],
    [3, '16px'],
    [4, '18px'],
    [5, '24px'],
    [6, '32px'],
    [7, '48px'],
]);

function sanitizePastedHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const classStyles = collectPastedClassStyles(template.content);
    sanitizePastedChildren(template.content, classStyles);
    return template.innerHTML;
}

function collectPastedClassStyles(root) {
    const classStyles = new Map();
    const rulePattern = /([^{}]+)\{([^{}]*)\}/g;

    for (const styleElement of root.querySelectorAll('style')) {
        const styleText = styleElement.textContent || '';
        let rule;

        while ((rule = rulePattern.exec(styleText))) {
            const safeStyle = sanitizePastedStyle(rule[2]);
            if (!safeStyle) continue;

            for (const selector of rule[1].split(',')) {
                const classMatches = selector.matchAll(/\.([_a-zA-Z][\w-]*)/g);
                for (const classMatch of classMatches) {
                    const className = classMatch[1];
                    const existingStyle = classStyles.get(className);
                    classStyles.set(className, existingStyle ? `${existingStyle}; ${safeStyle}` : safeStyle);
                }
            }
        }
    }

    return classStyles;
}

function sanitizePastedChildren(parent, classStyles) {
    for (const child of [...parent.childNodes]) sanitizePastedNode(child, classStyles);
}

function sanitizePastedNode(node, classStyles) {
    if (node.nodeType === Node.COMMENT_NODE) {
        node.remove();
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    if (PASTE_DROP_WITH_CONTENT_TAGS.has(node.tagName)) {
        node.remove();
        return;
    }

    sanitizePastedChildren(node, classStyles);

    if (!PASTE_ALLOWED_TAGS.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
    }

    sanitizePastedAttributes(node, classStyles);
}

function sanitizePastedAttributes(node, classStyles) {
    const originalAttributes = new Map([...node.attributes].map((attribute) => [attribute.name.toLowerCase(), attribute.value]));
    const styleParts = [];
    appendPastedClassStyles(styleParts, originalAttributes.get('class'), classStyles);
    appendPastedPresentationAttributeStyles(styleParts, node, originalAttributes);
    if (node.tagName === 'FONT') appendPastedFontAttributeStyles(styleParts, originalAttributes);
    styleParts.push(originalAttributes.get('style') || '');

    for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);

    const safeStyle = sanitizePastedStyle(styleParts.filter(Boolean).join('; '));
    if (safeStyle) node.setAttribute('style', safeStyle);

    restorePastedSafeAttributes(node, originalAttributes);
}

function appendPastedClassStyles(styleParts, classNames, classStyles) {
    for (const className of String(classNames || '').split(/\s+/).filter(Boolean)) {
        const classStyle = classStyles.get(className);
        if (classStyle) styleParts.push(classStyle);
    }
}

function appendPastedPresentationAttributeStyles(styleParts, node, attributes) {
    const align = attributes.get('align');
    if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH'].includes(node.tagName)) {
        appendPastedMatchingStyle(styleParts, 'text-align', align, /^(left|right|center|justify)$/i);
    }

    const verticalAlign = attributes.get('valign');
    if (['TD', 'TH', 'TR'].includes(node.tagName)) {
        appendPastedMatchingStyle(styleParts, 'vertical-align', verticalAlign, /^(top|middle|bottom|baseline)$/i);
    }

    if (['TABLE', 'TD', 'TH'].includes(node.tagName)) {
        const border = normalizePastedCssLength(attributes.get('border'));
        if (border && border !== '0px') styleParts.push(`border: ${border} solid currentColor`);
    }
}

function sanitizePastedStyle(styleText) {
    if (!styleText) return '';

    const parser = document.createElement('span');
    parser.setAttribute('style', styleText);

    return PASTE_ALLOWED_STYLE_PROPERTIES.map((property) => {
        const value = parser.style.getPropertyValue(property).trim();
        if (!value || PASTE_UNSAFE_STYLE_VALUE.test(value)) return '';

        const priority = parser.style.getPropertyPriority(property);
        return `${property}: ${value}${priority ? ` !${priority}` : ''}`;
    }).filter(Boolean).join('; ');
}

function appendPastedFontAttributeStyles(styleParts, attributes) {
    const color = attributes.get('color');
    if (isSafePastedStyleAttributeValue(color)) styleParts.push(`color: ${color}`);

    const size = sanitizePastedFontSize(attributes.get('size'));
    if (size) styleParts.push(`font-size: ${size}`);
}

function restorePastedSafeAttributes(node, attributes) {
    if (node.tagName === 'A') {
        const href = sanitizePastedUrl(attributes.get('href'));
        if (href) node.setAttribute('href', href);

        const title = attributes.get('title');
        if (title) node.setAttribute('title', title);
    }

    if (node.tagName === 'OL') {
        setPastedPositiveIntegerAttribute(node, 'start', attributes.get('start'));
        setPastedMatchingAttribute(node, 'type', attributes.get('type'), /^(1|a|A|i|I)$/);
    }

    if (node.tagName === 'UL') {
        setPastedMatchingAttribute(node, 'type', attributes.get('type'), /^(disc|circle|square)$/i);
    }

    if (node.tagName === 'LI') {
        setPastedPositiveIntegerAttribute(node, 'value', attributes.get('value'));
    }

    if (['TD', 'TH'].includes(node.tagName)) {
        setPastedPositiveIntegerAttribute(node, 'colspan', attributes.get('colspan'));
        setPastedPositiveIntegerAttribute(node, 'rowspan', attributes.get('rowspan'));
    }

    if (node.tagName === 'TABLE') {
        setPastedPositiveIntegerAttribute(node, 'border', attributes.get('border'));
    }

    if (['COL', 'COLGROUP'].includes(node.tagName)) {
        setPastedPositiveIntegerAttribute(node, 'span', attributes.get('span'));
    }
}

function sanitizePastedUrl(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('#')) return trimmed;

    try {
        const parsed = new URL(trimmed, window.location.href);
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? trimmed : '';
    } catch (error) {
        return '';
    }
}

function sanitizePastedFontSize(value) {
    const normalized = String(value || '').trim();
    if (!/^[+-]?\d+$/.test(normalized)) return '';

    const size = normalized.startsWith('+') || normalized.startsWith('-')
        ? 3 + Number.parseInt(normalized, 10)
        : Number.parseInt(normalized, 10);
    return PASTE_FONT_SIZE_MAP.get(Math.min(Math.max(size, 1), 7)) || '';
}

function isSafePastedStyleAttributeValue(value) {
    return Boolean(value) && !PASTE_UNSAFE_STYLE_ATTRIBUTE_VALUE.test(value);
}

function appendPastedSafeStyle(styleParts, property, value) {
    if (isSafePastedStyleAttributeValue(value)) styleParts.push(`${property}: ${value}`);
}

function appendPastedMatchingStyle(styleParts, property, value, pattern) {
    const normalized = String(value || '').trim();
    if (pattern.test(normalized)) styleParts.push(`${property}: ${normalized}`);
}

function appendPastedLengthStyle(styleParts, property, value) {
    const length = normalizePastedCssLength(value);
    if (length) styleParts.push(`${property}: ${length}`);
}

function normalizePastedCssLength(value) {
    const normalized = String(value || '').trim();
    if (!/^\d+(?:\.\d+)?(?:%|px|pt|em|rem)?$/i.test(normalized)) return '';
    return /^\d+(?:\.\d+)?$/.test(normalized) ? `${normalized}px` : normalized;
}

function setPastedPositiveIntegerAttribute(node, name, value) {
    const normalized = String(value || '').trim();
    if (/^\d+$/.test(normalized) && Number.parseInt(normalized, 10) > 0) {
        node.setAttribute(name, normalized);
    }
}

function setPastedMatchingAttribute(node, name, value, pattern) {
    const normalized = String(value || '').trim();
    if (pattern.test(normalized)) node.setAttribute(name, normalized);
}

function readStoredJson(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return cloneData(fallback);

    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`${key} JSON 파싱 실패`, error);
        return cloneData(fallback);
    }
}

function cloneData(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function toSafeText(value) {
    return String(value || '');
}

function escapeHtml(value) {
    return toSafeText(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeHtmlContent(html) {
    return sanitizePastedHtml(html);
}

function sanitizeLastActive(value) {
    if (!value || typeof value !== 'object') return null;
    return {
        novelId: value.novelId,
        chapterId: value.chapterId,
    };
}

function sanitizeSettings(value) {
    const next = { ...defaultSettings, ...(value && typeof value === 'object' ? value : {}) };
    next.darkMode = Boolean(next.darkMode);
    next.autoSaveMin = Math.max(Number.parseInt(next.autoSaveMin, 10) || defaultSettings.autoSaveMin, 1);
    next.targetCount = Math.max(Number.parseInt(next.targetCount, 10) || defaultSettings.targetCount, 1);
    next.goalType = next.goalType === 'nospace' ? 'nospace' : 'space';
    next.customSymbols = toSafeText(next.customSymbols || defaultSettings.customSymbols);
    return next;
}

function sanitizePasswordLock(lock) {
    if (!lock || typeof lock !== 'object') return undefined;
    const hash = toSafeText(lock.hash).trim();
    const salt = toSafeText(lock.salt).trim();
    if (!hash || !salt) return undefined;

    return {
        version: Number(lock.version) || PASSWORD_LOCK_VERSION,
        algorithm: toSafeText(lock.algorithm || 'SHA-256'),
        salt,
        hash,
    };
}

function sanitizeLibrary(value) {
    if (!Array.isArray(value)) return [];

    return value.map((novel) => {
        const safeNovel = {
            ...novel,
            id: novel?.id || Date.now(),
            title: toSafeText(novel?.title || '무제'),
            memo: toSafeText(novel?.memo),
            chapters: Array.isArray(novel?.chapters)
                ? novel.chapters.map((chapter) => ({
                    ...chapter,
                    id: chapter?.id || Date.now(),
                    title: toSafeText(chapter?.title || '무제'),
                    content: sanitizeHtmlContent(chapter?.content || ''),
                }))
                : [],
        };

        const safeLock = sanitizePasswordLock(novel?.passwordLock);
        if (safeLock) {
            safeNovel.passwordLock = safeLock;
            delete safeNovel.password;
        } else if (novel?.password) {
            safeNovel.password = toSafeText(novel.password);
        } else {
            delete safeNovel.password;
        }
        return safeNovel;
    });
}

function sanitizeCharacters(value) {
    if (!Array.isArray(value)) return [];

    return value.map((character) => ({
        ...character,
        id: character?.id || Date.now(),
        name: toSafeText(character?.name),
        age: toSafeText(character?.age),
        role: toSafeText(character?.role),
        appearance: toSafeText(character?.appearance),
        personality: toSafeText(character?.personality),
    }));
}

function normalizeState() {
    library = sanitizeLibrary(library);
    settings = sanitizeSettings(settings);
    characterList = sanitizeCharacters(characterList);
}

function bytesToHex(bytes) {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
    const encoded = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return bytesToHex(new Uint8Array(digest));
}

async function createPasswordLock(password) {
    const saltBytes = new Uint8Array(16);
    crypto.getRandomValues(saltBytes);
    const salt = bytesToHex(saltBytes);
    return {
        version: PASSWORD_LOCK_VERSION,
        algorithm: 'SHA-256',
        salt,
        hash: await hashPassword(password, salt),
    };
}

async function verifyPasswordLock(lock, password) {
    if (!lock || password == null) return false;
    return await hashPassword(password, lock.salt) === lock.hash;
}

function isNovelLocked(novel) {
    return Boolean(novel?.passwordLock || novel?.password);
}

async function verifyNovelPassword(novel, password) {
    if (novel.passwordLock) return await verifyPasswordLock(novel.passwordLock, password);
    return novel.password === password;
}

async function migrateLegacyPasswordLocks() {
    let changed = false;

    for (const novel of library) {
        if (novel.password && novel.passwordLock) {
            delete novel.password;
            changed = true;
            continue;
        }
        if (novel.password && !novel.passwordLock) {
            novel.passwordLock = await createPasswordLock(novel.password);
            delete novel.password;
            changed = true;
        }
    }

    if (changed) saveLibrary();
}

function getLastActiveState() {
    const active = currentNovelId && currentChapterId
        ? { novelId: currentNovelId, chapterId: currentChapterId }
        : readStoredJson('editorLastActive', null);
    return sanitizeLastActive(active);
}

function syncActiveEditorToModel() {
    const novel = getCurrentNovel();
    if (!novel || !currentChapterId) return;

    if (isHtmlMode) {
        const safeHtml = sanitizeHtmlContent(htmlEditor.value);
        htmlEditor.value = safeHtml;
        editor.innerHTML = safeHtml;
    }

    const chapter = novel.chapters.find((item) => item.id === currentChapterId);
    if (chapter) {
        chapter.title = toSafeText(titleInput.value.trim() || '무제');
        chapter.content = sanitizeHtmlContent(editor.innerHTML);
        editor.innerHTML = chapter.content;
        htmlEditor.value = chapter.content;
    }
    novel.memo = toSafeText(memoTextarea.value);
}

function getSnapshotState() {
    return {
        library: sanitizeLibrary(library),
        settings: sanitizeSettings(settings),
        characters: sanitizeCharacters(characterList),
        lastActive: getLastActiveState(),
    };
}

function saveSafetyBackup(reason) {
    syncActiveEditorToModel();
    const backups = readStoredJson(SAFETY_BACKUP_KEY, []);
    const backup = {
        id: `safety-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        reason,
        savedAt: new Date().toISOString(),
        data: getSnapshotState(),
    };
    localStorage.setItem(SAFETY_BACKUP_KEY, JSON.stringify([backup, ...backups].slice(0, MAX_SAFETY_BACKUPS)));
    return backup;
}

async function applyRestoredState(state) {
    if (!Array.isArray(state?.library)) throw new Error('Invalid restored library');
    library = sanitizeLibrary(state?.library);
    settings = sanitizeSettings(state?.settings || settings);
    characterList = sanitizeCharacters(state?.characters || characterList);
    const lastActive = sanitizeLastActive(state?.lastActive);
    if (lastActive) {
        localStorage.setItem('editorLastActive', JSON.stringify(lastActive));
    } else {
        localStorage.removeItem('editorLastActive');
    }
    await migrateLegacyPasswordLocks();
    saveLibrary();
    applySettings();
    renderSymbolButtons();
}

// ============================================================
// [3] 인증 시스템
// ============================================================

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    loginMessage.innerText = "";
    if (isLoginMode) {
        authTitle.innerText = "로그인";
        btnAuthAction.innerText = "로그인";
        toggleText.innerText = "계정이 없으신가요?";
        btnToggleMode.innerText = "회원가입";
        signupFields.style.display = 'none';
        signupConfirmField.style.display = 'none';
    } else {
        authTitle.innerText = "회원가입";
        btnAuthAction.innerText = "가입하기";
        toggleText.innerText = "이미 계정이 있으신가요?";
        btnToggleMode.innerText = "로그인";
        signupFields.style.display = 'block';
        signupConfirmField.style.display = 'block';
    }
}

btnToggleMode.addEventListener('click', toggleAuthMode);

btnAuthAction.addEventListener('click', async () => {
    const id = emailInput.value.trim();
    const password = passwordInput.value;
    const nickname = nicknameInput.value.trim();
    const confirmPassword = confirmPasswordInput.value;

    if (!id || !password) {
        loginMessage.innerText = "아이디와 비밀번호를 입력해주세요.";
        return;
    }
    const email = id + DOMAIN; 

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            if (password !== confirmPassword) { loginMessage.innerText = "비밀번호가 일치하지 않습니다."; return; }
            if (password.length < 6) { loginMessage.innerText = "비밀번호는 6자리 이상이어야 합니다."; return; }
            if (!nickname) { loginMessage.innerText = "작가명(닉네임)을 입력해주세요."; return; }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, { displayName: nickname });
            alert(`환영합니다, ${nickname} 작가님!`);
        }
    } catch (error) {
        let msg = "오류: " + error.code;
        if (error.code === 'auth/email-already-in-use') msg = "이미 사용 중인 아이디입니다.";
        else if (error.code === 'auth/invalid-email') msg = "아이디 형식이 올바르지 않습니다.";
        else if (error.code === 'auth/wrong-password') msg = "비밀번호가 틀렸습니다.";
        else if (error.code === 'auth/user-not-found') msg = "존재하지 않는 아이디입니다.";
        else if (error.code === 'auth/weak-password') msg = "비밀번호가 너무 약합니다.";
        loginMessage.innerText = msg;
    }
});

if (btnGuest) {
    btnGuest.addEventListener('click', async () => {
        loginOverlay.style.display = 'none';
        if (userInfoDisplay) userInfoDisplay.innerText = '비로그인 (로컬 모드)';
        currentUser = null;
        await init();
    });
}

if(btnShowInfo) btnShowInfo.addEventListener('click', () => { infoModal.style.display = 'flex'; });
if(btnCloseInfo) btnCloseInfo.addEventListener('click', () => { infoModal.style.display = 'none'; });

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        loginOverlay.style.display = 'none';
        const displayName = user.displayName || user.email.split('@')[0];
        if(userInfoDisplay) userInfoDisplay.innerText = `${displayName}님 (Cloud On)`;
        await syncFromCloud(user.uid);
        await init();
    } else {
        currentUser = null;
        loginOverlay.style.display = 'flex';
        emailInput.value = ''; passwordInput.value = ''; 
        if(userInfoDisplay) userInfoDisplay.innerText = '';
    }
});

if(btnLogout) btnLogout.addEventListener('click', () => {
    if(confirm("로그아웃 하시겠습니까?")) signOut(auth).then(() => location.reload());
});

// ============================================================
// [4] 클라우드 동기화
// ============================================================
async function syncFromCloud(uid) {
    if(sidebarStatus) sidebarStatus.innerText = "동기화 중...";
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const serverData = docSnap.data();
            const serverTime = new Date(serverData.lastUpdated || 0).getTime();
            const localTimeStr = localStorage.getItem('localLastUpdated');
            const localTime = localTimeStr ? new Date(localTimeStr).getTime() : 0;

            if (localTime > serverTime) {
                if (confirm("로컬 데이터가 더 최신입니다. 서버를 덮어쓸까요?\n(취소 시 서버 데이터를 가져옵니다)")) {
                    await saveToCloud();
                    if(sidebarStatus) sidebarStatus.innerText = "서버 업데이트 완료";
                } else {
                    const applied = await applyServerData(serverData);
                    if(sidebarStatus) sidebarStatus.innerText = applied ? "서버 데이터 로드" : "서버 데이터 오류";
                }
            } else {
                const applied = await applyServerData(serverData);
                if(sidebarStatus) sidebarStatus.innerText = applied ? "동기화 완료" : "서버 데이터 오류";
            }
        } else {
            await saveToCloud();
        }
    } catch (e) {
        console.error(e);
        if(sidebarStatus) sidebarStatus.innerText = "동기화 실패";
    }
}

// [수정됨] 서버 데이터 적용 (마지막 작업 위치 동기화)
async function applyServerData(data) {
    let nextLibrary = null;

    if (data.isCompressed && data.compressedLibrary) {
        try {
            const decompressed = LZString.decompressFromUTF16(data.compressedLibrary);
            nextLibrary = JSON.parse(decompressed);
        } catch (e) {
            console.error("압축 해제 실패", e);
            return false;
        }
    } else if (data.library) {
        nextLibrary = data.library;
    }

    if (!Array.isArray(nextLibrary)) {
        console.warn("서버 데이터의 library 형식이 올바르지 않아 적용하지 않았습니다.");
        return false;
    }

    await applyRestoredState({
        library: nextLibrary,
        settings: data.settings || settings,
        characters: data.characters || characterList,
        lastActive: data.lastActive,
    });

    if (data.lastUpdated) localStorage.setItem('localLastUpdated', data.lastUpdated);
    return true;
}
async function saveToCloud() {
    if (!currentUser) return;
    syncActiveEditorToModel();
    normalizeState();

    const now = new Date().toISOString();
    const state = getSnapshotState();
    const compressedLibrary = LZString.compressToUTF16(JSON.stringify(state.library));

    try {
        await setDoc(doc(db, "users", currentUser.uid), {
            compressedLibrary,
            isCompressed: true,
            settings: state.settings,
            characters: state.characters,
            lastUpdated: now,
            lastActive: state.lastActive,
        });
        localStorage.setItem('localLastUpdated', now);
    } catch (error) {
        console.error("저장 실패", error);
        if (error.code === 'resource-exhausted') {
            alert("⚠️ 저장 실패: 데이터 용량이 너무 큽니다. 불필요한 내용을 정리해주세요.");
        }
        throw error;
    }
}

// ============================================================
// [5] 에디터 및 히스토리 로직
// ============================================================

function recordHistory() {
    const content = isHtmlMode ? htmlEditor.value : editor.innerHTML;
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === content) return;
    undoStack.push(content);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
}
function performUndo() {
    if (undoStack.length === 0) return;
    redoStack.push(isHtmlMode ? htmlEditor.value : editor.innerHTML);
    const prev = undoStack.pop();
    if (isHtmlMode) htmlEditor.value = prev; else editor.innerHTML = prev;
    updateCount();
}
function performRedo() {
    if (redoStack.length === 0) return;
    undoStack.push(isHtmlMode ? htmlEditor.value : editor.innerHTML);
    const next = redoStack.pop();
    if (isHtmlMode) htmlEditor.value = next; else editor.innerHTML = next;
    updateCount();
}
document.addEventListener('keydown', (e) => {
    const isEditorTarget = document.activeElement === editor || e.target === editor;
    const isPlainTextField = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
        && document.activeElement !== htmlEditor;
    const key = e.key.toLowerCase();
    if (!isPlainTextField && document.activeElement !== htmlEditor && (e.ctrlKey||e.metaKey) && key === 'v') {
        pendingPasteMode = e.shiftKey ? 'plain' : 'rich';
        window.setTimeout(() => { pendingPasteMode = 'rich'; }, 1000);
    }
    if (!isEditorTarget && document.activeElement !== htmlEditor) return;
    if ((e.ctrlKey||e.metaKey) && !e.shiftKey && key==='z') { e.preventDefault(); performUndo(); }
    if ((e.ctrlKey||e.metaKey) && (key==='y' || (e.shiftKey && key==='z'))) { e.preventDefault(); performRedo(); }
});
editor.addEventListener('beforeinput', () => {
    if (!historyDebounceTimer) recordHistory();
    clearTimeout(historyDebounceTimer);
    historyDebounceTimer = setTimeout(() => { historyDebounceTimer = null; }, 1000);
});

// [중요] 초기화 로직 수정
// [수정됨] 초기화 (마지막 작업 소설 자동 열기)
async function init() {
    normalizeState();
    await migrateLegacyPasswordLocks();
    applySettings();
    checkMigration();
    renderSymbolButtons();
    
    // 소설이 없으면 생성
    if (library.length === 0) {
        createNovel("새 소설");
    } else {
        // [NEW] 저장된 마지막 위치(editorLastActive)가 있는지 확인
        const lastActive = readStoredJson('editorLastActive', null);
        
        // 마지막 위치 정보가 있고, 해당 소설이 실제로 존재하면 그 ID 사용
        let targetNovelId = library[0].id; // 기본값: 첫 번째 소설
        if (lastActive && library.find(n => n.id === lastActive.novelId)) {
            targetNovelId = lastActive.novelId;
        }

        // 1. 소설 열기 (기본적으로 1화가 열림)
        await openNovel(targetNovelId);

        // 2. 만약 마지막으로 작업한 챕터가 1화가 아니라면, 그 챕터로 이동
        if (lastActive && lastActive.chapterId && currentNovelId === targetNovelId) {
            const n = getCurrentNovel();
            // 해당 챕터가 존재하는지 확인 후 이동
            if (n && n.chapters.find(c => c.id === lastActive.chapterId)) {
                loadChapter(lastActive.chapterId);
            }
        }
    }
    
    startAutoSaveTimer();
    enableDragAndDrop();
}



// [NEW] 모바일 메뉴 토글 로직
if (btnMobileMenu) {
    btnMobileMenu.addEventListener('click', () => {
        sidebar.classList.add('open');
        mobileOverlay.classList.add('active');
    });
}

// 오버레이(배경) 클릭 시 사이드바 닫기
if (mobileOverlay) {
    mobileOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        mobileOverlay.classList.remove('active');
    });
}

// 소설이나 챕터 선택 시 모바일 사이드바 자동으로 닫기
// (기존 sidebarListEl 클릭 이벤트에 로직이 포함되어야 함. 
//  가장 쉬운 방법은 전역 이벤트로 처리하는 것입니다.)
sidebarListEl.addEventListener('click', (e) => {
    // 리스트 아이템을 클릭했을 때만 닫힘 (모바일 환경 체크)
    if (window.innerWidth <= 768 && (e.target.closest('.novel-item') || e.target.closest('.chapter-item'))) {
        sidebar.classList.remove('open');
        mobileOverlay.classList.remove('active');
    }
});
// ============================================================
// [6] 초기화 및 버전 표시 실행 (맨 아래쪽에 추가)
// ============================================================

// 버전 정보 화면에 출력
const versionDisplay = document.getElementById('versionDisplay');
if (versionDisplay) {
    versionDisplay.innerText = `${APP_VERSION} / ${LAST_UPDATED}`;
}

// Window export
window.performSave = performSave;
window.autoLineBreak = autoLineBreak;
window.toggleMemoPanel = toggleMemoPanel;
window.toggleHtmlMode = toggleHtmlMode;
window.downloadAll = downloadAll;
window.backupData = backupData;
window.toggleDarkMode = toggleDarkMode;
window.toggleSearchModal = toggleSearchModal;
window.findAndReplace = findAndReplace;
window.execCmd = execCmd;
window.pasteFromClipboard = pasteFromClipboard;
window.insertSymbol = insertSymbol;

function checkMigration() {
    const old = localStorage.getItem('myNovelData');
    if (old) {
        try {
            const parsed = JSON.parse(old);
            if (Array.isArray(parsed)) {
                library.push({
                    id: Date.now(),
                    title: "복구된 소설",
                    chapters: parsed,
                    memo: localStorage.getItem('editorMemo') || '',
                });
                saveLibrary();
                localStorage.removeItem('myNovelData');
                localStorage.removeItem('editorMemo');
                alert("이전 데이터 복구됨");
            }
        } catch (error) {
            console.warn("이전 데이터 복구 실패", error);
        }
    }
}

// [수정됨] 서재 목록 렌더링 (잠금 버튼 추가)
function renderLibrary() {
    viewMode = 'library'; currentNovelId = null;
    sidebarTitle.innerText = "내 서재";
    sidebarTitle.ondblclick = null; sidebarTitle.style.cursor = "default"; sidebarTitle.title = "";
    sidebarActionBtn.title = "새 소설"; sidebarActionBtn.onclick = createNovelPrompt;
    if(sidebarStatus) sidebarStatus.innerText = `총 ${library.length}개`;
    libraryHomeBtn.style.display = 'none'; 
    editorWrapper.style.display = 'none';

    sidebarListEl.innerHTML = '';
    library.forEach(n => {
        const li = document.createElement('li');
        li.className = 'list-item novel-item';

        const isLocked = isNovelLocked(n);
        const icon = isLocked ? '🔒' : '📘';
        const lockBtnTitle = isLocked ? '잠금 해제' : '비밀번호 설정';
        const lockBtnIcon = isLocked ? '🔓' : '🔐';

        const titleGroup = document.createElement('div');
        titleGroup.style.display = 'flex';
        titleGroup.style.alignItems = 'center';
        titleGroup.style.overflow = 'hidden';

        const iconEl = document.createElement('span');
        iconEl.className = 'novel-icon';
        iconEl.textContent = icon;

        const titleEl = document.createElement('span');
        titleEl.style.whiteSpace = 'nowrap';
        titleEl.style.overflow = 'hidden';
        titleEl.style.textOverflow = 'ellipsis';
        titleEl.textContent = n.title;

        const actions = document.createElement('div');
        actions.className = 'novel-actions';

        const lockBtn = document.createElement('button');
        lockBtn.className = 'lock-btn';
        lockBtn.title = lockBtnTitle;
        lockBtn.textContent = lockBtnIcon;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = '삭제';
        deleteBtn.textContent = '🗑️';

        titleGroup.append(iconEl, titleEl);
        actions.append(lockBtn, deleteBtn);
        li.append(titleGroup, actions);
        
        li.onclick = (e) => { 
            // 삭제 버튼 클릭
            if (e.target.classList.contains('delete-btn')) { 
                deleteNovel(n.id); 
                return; 
            }
            // 잠금/해제 버튼 클릭 (이벤트 전파 방지 중요)
            if (e.target.classList.contains('lock-btn')) {
                e.stopPropagation();
                toggleLock(n.id);
                return;
            }
            // 소설 열기
            openNovel(n.id);
        };
        sidebarListEl.appendChild(li);
    });
}

function createNovelPrompt() { const t = prompt("제목:", "새 작품"); if (t) createNovel(t); }
function createNovel(t) {
    library.push({
        id: Date.now(),
        title: toSafeText(t || '새 작품'),
        chapters: [{ id: Date.now(), title: '1화', content: '' }],
        memo: '',
    });
    saveLibrary();
    renderLibrary();
}
function deleteNovel(id) {
    if(!confirm("삭제?")) return;
    saveSafetyBackup('delete-novel');
    library = library.filter(n => n.id !== id);
    saveLibrary();
    renderLibrary();
}

// [수정됨] 소설 열기 (중복 제거 및 최적화 완료)
async function openNovel(id) {
    const n = library.find(n => n.id === id);
    if (!n) return;

    if (isNovelLocked(n)) {
        const input = prompt("🔒 이 소설은 비밀번호로 보호되어 있습니다.\n비밀번호를 입력하세요:");

        if (input === null) {
            renderLibrary();
            return;
        }

        if (!await verifyNovelPassword(n, input)) {
            alert("비밀번호가 일치하지 않습니다.");
            renderLibrary();
            return;
        }

        if (n.password && !n.passwordLock) {
            n.passwordLock = await createPasswordLock(n.password);
            delete n.password;
            saveLibrary();
        }
    }

    currentNovelId = id; memoTextarea.value = toSafeText(n.memo);
    if (n.chapters.length > 0) currentChapterId = n.chapters[0].id;
    else { const c = { id: Date.now(), title: '1화', content: '' }; n.chapters.push(c); currentChapterId = c.id; }
    
    // 에디터 화면 표시
    editorWrapper.style.display = 'flex';
    
    renderNovelSidebar(); 
    loadChapter(currentChapterId);
    undoStack=[]; redoStack=[];
}

function renderNovelSidebar() {
    viewMode = 'novel';
    const n = library.find(n => n.id === currentNovelId); if (!n) return renderLibrary();
    sidebarTitle.innerText = n.title;
    sidebarTitle.style.cursor = "pointer"; sidebarTitle.title = "더블클릭 수정";
    sidebarTitle.ondblclick = () => {
        const inp = document.createElement('input'); inp.value = toSafeText(n.title); inp.className = 'title-edit-input';
        sidebarTitle.innerHTML=''; sidebarTitle.appendChild(inp); inp.focus();
        const finish = () => { if(inp.value.trim() && inp.value!==n.title){ n.title=toSafeText(inp.value.trim()); saveLibrary(); } renderNovelSidebar(); };
        inp.onblur = finish; inp.onkeydown = (e) => { if(e.key==='Enter') finish(); }; inp.onclick = e => e.stopPropagation();
    };
    sidebarActionBtn.title = "챕터 추가"; sidebarActionBtn.onclick = addNewChapter;
    if(sidebarStatus) sidebarStatus.innerText = "드래그 정렬 가능"; 
    libraryHomeBtn.style.display = 'inline-block';
    libraryHomeBtn.onclick = () => { performSave(); renderLibrary(); };
    sidebarListEl.innerHTML = '';
    n.chapters.forEach(c => {
        const li = document.createElement('li'); li.className = `list-item chapter-item ${c.id===currentChapterId?'active':''}`;
        li.setAttribute('draggable','true'); li.setAttribute('data-id', c.id);
        const title = document.createElement('span');
        title.textContent = c.title || '무제';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        li.append(title, deleteBtn);
        li.onclick = (e) => { if(e.target.classList.contains('delete-btn')) { deleteChapter(c.id); return; } switchChapter(c.id); };
        sidebarListEl.appendChild(li);
    });
}

async function addNewChapter() {
    await performSave({ syncCloud: false });
    const n = getCurrentNovel();
    if (!n) return;
    n.chapters.push({ id: Date.now(), title: `${n.chapters.length+1}화`, content: '' });
    loadChapter(n.chapters[n.chapters.length-1].id);
    renderNovelSidebar();
    saveLibrary();
}
function deleteChapter(id) {
    const n = getCurrentNovel();
    if(!n) return;
    if(n.chapters.length<=1) return alert("최소 1개 필요");
    if(!confirm("삭제?")) return;
    saveSafetyBackup('delete-chapter');
    n.chapters = n.chapters.filter(c => c.id!==id);
    if(currentChapterId===id) loadChapter(n.chapters[0].id); else renderNovelSidebar();
    saveLibrary();
}
function getCurrentNovel() { return library.find(n => n.id === currentNovelId); }

function enableDragAndDrop() {
    if (enableDragAndDrop.enabled) return;
    enableDragAndDrop.enabled = true;
    let d = null;
    sidebarListEl.addEventListener('dragstart', e => { if(viewMode!=='novel'||!e.target.classList.contains('chapter-item')) return; d=e.target; e.target.classList.add('dragging'); });
    sidebarListEl.addEventListener('dragend', e => { if(!d) return; e.target.classList.remove('dragging'); d=null; updateChaptersOrder(); });
    sidebarListEl.addEventListener('dragover', e => { e.preventDefault(); if(viewMode!=='novel') return; const after = getDragAfterElement(sidebarListEl, e.clientY); if(after==null) sidebarListEl.appendChild(d); else sidebarListEl.insertBefore(d, after); });
}
function getDragAfterElement(c, y) { const els = [...c.querySelectorAll('.chapter-item:not(.dragging)')]; return els.reduce((closest, child) => { const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2; if (offset < 0 && offset > closest.offset) return { offset: offset, element: child }; else return closest; }, { offset: Number.NEGATIVE_INFINITY }).element; }
function updateChaptersOrder() { const n = getCurrentNovel(); const newC = []; sidebarListEl.querySelectorAll('.chapter-item').forEach(item => { const id = Number(item.getAttribute('data-id')); const c = n.chapters.find(ch => ch.id === id); if (c) newC.push(c); }); n.chapters = newC; performSave(); }

// [수정됨] 챕터 로드 (위치 기억 기능 추가)
function loadChapter(id) {
    const n = getCurrentNovel();
    if (!n) return;
    const c = n.chapters.find(ch => ch.id === id);
    if (c) {
        currentChapterId = id;
        c.title = toSafeText(c.title || '무제');
        c.content = sanitizeHtmlContent(c.content || '');
        titleInput.value = c.title;
        editor.innerHTML = c.content;
        htmlEditor.value = c.content;
        undoStack=[]; redoStack=[]; 
        hasUnsavedChanges = false; 
        updateUnsavedIndicator(); 
        updateCount(); 
        renderNovelSidebar(); 
        
        // [NEW] 챕터를 열 때마다 로컬 스토리지에 '마지막 작업 위치' 기록
        if (currentNovelId && currentChapterId) {
            localStorage.setItem('editorLastActive', JSON.stringify({
                novelId: currentNovelId,
                chapterId: currentChapterId
            }));
        }
    } 
}

// [누락된 함수 추가] 챕터 전환
async function switchChapter(id) { await performSave(); loadChapter(id); }
// [수정됨] 저장 로직 (메시지 덮어쓰기 버그 수정)
async function performSave(options = {}) {
    if (viewMode === 'library') return false;
    const n = getCurrentNovel();
    // [안전장치] 소설이 없으면 저장 중단
    if (!n) {
        console.warn("저장할 소설이 선택되지 않았습니다.");
        return false;
    }

    syncActiveEditorToModel();
    saveLibrary();

    if (currentUser && options.syncCloud !== false) {
        lastSavedDisplay.innerText = "저장 중...";
        lastSavedDisplay.style.color = '#4a90e2';
        try {
            await saveToCloud();
            lastSavedDisplay.innerText = "저장됨(Cloud)";
            lastSavedDisplay.style.color = '#4a90e2';
        } catch (error) {
            lastSavedDisplay.innerText = "클라우드 저장 실패(Local 보존)";
            lastSavedDisplay.style.color = '#e74c3c';
        }
    } else {
        lastSavedDisplay.innerText = "저장됨(Local)";
        lastSavedDisplay.style.color = '#2ecc71';
    }
    
    hasUnsavedChanges = false;
    // [중요] updateUnsavedIndicator() 호출 제거
    // (이 함수가 '준비됨'으로 텍스트를 즉시 덮어쓰기 때문)
    unsavedDot.style.display = 'none'; // 점만 끈다

    setTimeout(() => { lastSavedDisplay.style.color = '#aaa'; }, 2000);
    return true;
}

function saveLibrary() {
    normalizeState();
    localStorage.setItem('novelLibrary', JSON.stringify(library));
    localStorage.setItem('editorSettings', JSON.stringify(settings));
    // [NEW] 캐릭터 데이터 로컬 저장
    localStorage.setItem('characterList', JSON.stringify(characterList)); 
    localStorage.setItem('localLastUpdated', new Date().toISOString());
}

// ============================================================
// [NEW] 상단 메뉴 토글 로직 (모바일용)
// ============================================================
const btnMoreMenu = document.getElementById('btnMoreMenu');
const rightToolbarItems = document.getElementById('rightToolbarItems');

if (btnMoreMenu && rightToolbarItems) {
    // 버튼 클릭 시 메뉴 보이기/숨기기
    btnMoreMenu.addEventListener('click', (e) => {
        e.stopPropagation(); // 이벤트 버블링 방지
        rightToolbarItems.classList.toggle('show');
    });

    // 메뉴 영역 밖을 클릭하면 닫기
    document.addEventListener('click', (e) => {
        if (!rightToolbarItems.contains(e.target) && !btnMoreMenu.contains(e.target)) {
            rightToolbarItems.classList.remove('show');
        }
    });
    
    // 메뉴 내부 버튼 클릭 시 메뉴 닫기 (편의성)
    rightToolbarItems.addEventListener('click', () => {
        if(window.innerWidth <= 768) {
            rightToolbarItems.classList.remove('show');
        }
    });
}

// ============================================================
// [NEW] 설정 팝업 토글 로직
// ============================================================
const btnSettings = document.getElementById('btnSettings');
const settingsPopup = document.getElementById('settingsPopup');

if (btnSettings && settingsPopup) {
    btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPopup.classList.toggle('show');
    });

    // 팝업 내부 클릭 시 닫히지 않도록
    settingsPopup.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 화면 아무 곳이나 클릭하면 팝업 닫기
    document.addEventListener('click', (e) => {
        if (!settingsPopup.contains(e.target) && e.target !== btnSettings) {
            settingsPopup.classList.remove('show');
        }
    });
}

// ============================================================
// [NEW] 커스텀 기호 관리 로직
// ============================================================

const symbolGroup = document.getElementById('symbolGroup');
const symbolEditModal = document.getElementById('symbolEditModal');
const symbolInput = document.getElementById('symbolInput');

// 1. 기호 버튼 렌더링 (핵심)
function renderSymbolButtons() {
    if (!symbolGroup) return;
    symbolGroup.innerHTML = ''; // 기존 버튼 초기화

    // 저장된 문자열을 콤마로 잘라서 배열로 만듦
    const symbols = (settings.customSymbols || "「」, 『』, (), [], “”, ─, …, ★").split(',');

    symbols.forEach(sym => {
        const s = sym.trim();
        if (!s) return;

        const btn = document.createElement('button');
        btn.className = 'btn-symbol';
        
        // 2글자이고 괄호처럼 짝이 맞는 경우 (예: "「」") -> 앞뒤로 감싸는 기능
        if (s.length === 2) {
            const open = s[0];
            const close = s[1];
            btn.innerText = s; // 버튼에는 "「」" 표시
            btn.onclick = () => window.insertSymbol(open, close);
        } else {
            // 그 외 (예: "…", "★", "※") -> 그냥 삽입
            btn.innerText = s;
            btn.onclick = () => window.insertSymbol(s, '');
        }
        symbolGroup.appendChild(btn);
    });
}

// 2. 편집 모달 열기
window.openSymbolEditor = function() {
    symbolInput.value = settings.customSymbols || "";
    symbolEditModal.style.display = 'block';
};

// 3. 편집 모달 닫기
window.closeSymbolEditor = function() {
    symbolEditModal.style.display = 'none';
};

// 4. 저장하고 적용하기
window.saveCustomSymbols = function() {
    const val = toSafeText(symbolInput.value);
    settings.customSymbols = val; // 설정 객체 업데이트
    settings = sanitizeSettings(settings);
    localStorage.setItem('editorSettings', JSON.stringify(settings)); // 로컬 저장
    
    // 클라우드 저장 (로그인 상태라면)
    if (currentUser) {
        saveToCloud().catch((error) => {
            console.error("기호 설정 클라우드 저장 실패", error);
        });
    }
    
    renderSymbolButtons(); // 버튼 다시 그리기
    window.closeSymbolEditor(); // 창 닫기
    alert("기호 설정이 저장되었습니다.");
};

function startAutoSaveTimer() { if (autoSaveTimerId) clearInterval(autoSaveTimerId); const m = Math.max(parseInt(autoSaveInput.value, 10) || 3, 1); settings.autoSaveMin = m; settings = sanitizeSettings(settings); localStorage.setItem('editorSettings', JSON.stringify(settings)); autoSaveTimerId = setInterval(() => { if (hasUnsavedChanges) performSave(); }, m * 60 * 1000); }
function markAsUnsaved() { if (!hasUnsavedChanges) { hasUnsavedChanges = true; updateUnsavedIndicator(); } updateCount(); }
function updateUnsavedIndicator() { unsavedDot.style.display = hasUnsavedChanges ? 'inline-block' : 'none'; lastSavedDisplay.innerText = hasUnsavedChanges ? '저장 안됨' : '준비됨'; }
function updateCount() { let t = editor.innerText || ''; charCountEl.innerText = t.length; charCountNoSpaceEl.innerText = t.replace(/\s/g, '').length; updateGoalProgress(); }
function updateGoalProgress() { const t = parseInt(targetCountInput.value) || 5000; const type = goalTypeSelect.value; let curr = (type === 'nospace') ? parseInt(charCountNoSpaceEl.innerText) : parseInt(charCountEl.innerText); let p = (curr / t) * 100; if (p > 100) p = 100; goalProgressBar.style.width = `${p}%`; goalPercentage.innerText = `${Math.floor((curr/t)*100)}%`; }

targetCountInput.addEventListener('input', () => { settings.targetCount = targetCountInput.value; settings = sanitizeSettings(settings); localStorage.setItem('editorSettings', JSON.stringify(settings)); updateGoalProgress(); });
goalTypeSelect.addEventListener('change', () => { settings.goalType = goalTypeSelect.value; settings = sanitizeSettings(settings); localStorage.setItem('editorSettings', JSON.stringify(settings)); updateGoalProgress(); });
memoTextarea.addEventListener('input', () => markAsUnsaved());

function insertSymbol(o, c) { if(isHtmlMode)return; recordHistory(); document.execCommand('insertText',false,o+c); if(c){const s=window.getSelection(),r=s.getRangeAt(0);r.setStart(r.startContainer,r.startOffset-1);r.setEnd(r.startContainer,r.startOffset-1);s.removeAllRanges();s.addRange(r);} editor.focus(); markAsUnsaved(); }
function toggleMemoPanel() { memoPanel.classList.toggle('open'); }
function toggleHtmlMode() {
    isHtmlMode = !isHtmlMode;
    if (isHtmlMode) {
        htmlEditor.value = sanitizeHtmlContent(editor.innerHTML);
        editor.style.display = 'none';
        htmlEditor.style.display = 'block';
    } else {
        const safeHtml = sanitizeHtmlContent(htmlEditor.value);
        htmlEditor.value = safeHtml;
        editor.innerHTML = safeHtml;
        htmlEditor.style.display = 'none';
        editor.style.display = 'block';
        updateCount();
    }
}
function toggleSearchModal(){searchModal.style.display=(searchModal.style.display==='none'?'block':'none');if(searchModal.style.display==='block')findInput.focus();}
function execCmd(c){ if(isHtmlMode)return; recordHistory(); document.execCommand(c,false,null); editor.focus(); markAsUnsaved(); }
function extractPlainTextFromPastedHtml(html) {
    if (!html) return '';
    const template = document.createElement('template');
    template.innerHTML = String(html);
    return template.content.textContent || '';
}

function insertPlainClipboardText(text) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) {
        document.execCommand('insertText', false, text);
        return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const fragment = document.createDocumentFragment();
    String(text).split(/\r\n|\r|\n/).forEach((line, index) => {
        if (index > 0) fragment.appendChild(document.createElement('br'));
        fragment.appendChild(document.createTextNode(line));
    });

    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

function insertClipboardContent(payload, mode = 'rich') {
    if (isHtmlMode) return false;

    const html = payload?.html || '';
    const text = payload?.text || '';
    const plainText = text || extractPlainTextFromPastedHtml(html);
    const safeHtml = mode === 'rich' && html ? sanitizePastedHtml(html) : '';
    const content = safeHtml || plainText;
    if (!content) return false;

    recordHistory();
    editor.focus();
    if (safeHtml) {
        document.execCommand('insertHTML', false, safeHtml);
    } else if (mode === 'plain') {
        insertPlainClipboardText(plainText);
    } else {
        document.execCommand('insertText', false, plainText);
    }
    markAsUnsaved();
    return true;
}

async function readSystemClipboard() {
    const payload = { html: '', text: '' };

    if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (!payload.html && item.types.includes('text/html')) {
                payload.html = await (await item.getType('text/html')).text();
            }
            if (!payload.text && item.types.includes('text/plain')) {
                payload.text = await (await item.getType('text/plain')).text();
            }
        }
    }

    if (!payload.text && navigator.clipboard?.readText) {
        payload.text = await navigator.clipboard.readText();
    }

    return payload;
}

async function pasteFromClipboard(mode = 'rich') {
    try {
        const pasted = insertClipboardContent(await readSystemClipboard(), mode);
        if (!pasted) alert('클립보드에 붙여넣을 내용이 없습니다.');
    } catch (error) {
        alert('클립보드 권한을 허용하거나 단축키로 붙여넣어 주세요.');
    }
}

editor.addEventListener('paste', e => {
    if (isHtmlMode) return;

    const clipboard = e.clipboardData || window.clipboardData;
    if (!clipboard) return;

    const html = clipboard.getData('text/html');
    const text = clipboard.getData('text/plain');
    const mode = pendingPasteMode;
    if (!html && !text) return;
    pendingPasteMode = 'rich';

    e.preventDefault();
    insertClipboardContent({ html, text }, mode);
});
function findAndReplace(){ const f=findInput.value,r=replaceInput.value; if(!f||isHtmlMode)return; if(!confirm('변경?'))return; const c=editor.innerHTML; const n=sanitizeHtmlContent(c.split(f).join(r)); if(c===n)alert('없음'); else { recordHistory(); editor.innerHTML=n; htmlEditor.value=n; markAsUnsaved(); toggleSearchModal(); alert('완료'); } }
function autoLineBreak(){ if(isHtmlMode)return; const o=document.getElementById('lineBreakOption').value,ig=document.getElementById('ignoreEllipsis').checked,br=(o==='2'?'<br><br>':'<br>'); let h=editor.innerHTML,rx=ig ? /("[^"]*")|((?<!\.)\.(\s|&nbsp;))/g : /("[^"]*")|(\.(\s|&nbsp;))/g; const n=sanitizeHtmlContent(h.replace(rx, (m,q)=>{ return q ? m : '.'+br; })); if(h!==n){ recordHistory(); editor.innerHTML=n; htmlEditor.value=n; markAsUnsaved(); alert('완료'); } else alert('변경없음'); }

async function downloadAll(format) {
    const n = getCurrentNovel(); if(!n) return; await performSave({ syncCloud: false });
    if(!confirm(`${format.toUpperCase()} 저장?`)) return;
    const safeNovel = sanitizeLibrary([n])[0];
    const fileName = toSafeText(safeNovel.title || 'novel').replace(/[\\/:*?"<>|]/g, '_');
    if (format === 'txt') {
        let all = ""; const line = "\n\n====================\n\n";
        safeNovel.chapters.forEach((c,i)=>{ const t=document.createElement('div'); t.innerHTML=c.content.replace(/<br\s*\/?>/gi,"\n"); all+=`[${c.title}]\n\n${t.innerText}`; if(i<safeNovel.chapters.length-1)all+=line; });
        saveBlob(new Blob([all],{type:'text/plain'}), `${fileName}.txt`);
    } else if (format === 'docx') {
        let c = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>${escapeHtml(safeNovel.title)}</title><body>`;
        safeNovel.chapters.forEach(ch => { c += `<h1>${escapeHtml(ch.title)}</h1>${ch.content}<br><br>`; });
        c += `</body></html>`;
        if (typeof htmlDocx !== 'undefined') saveBlob(htmlDocx.asBlob(c), `${fileName}.docx`); else alert("Lib Error");
    }
}

async function backupData() {
    syncActiveEditorToModel();
    saveLibrary();
    const d = { version: APP_VERSION, backupDate: new Date().toISOString(), ...getSnapshotState() };
    saveBlob(new Blob([JSON.stringify(d, null, 2)],{type:'application/json'}), `Backup_${new Date().toISOString().slice(0,10)}.json`);
}
function restoreData(e) {
    const f=e.target.files[0];
    if(!f||!confirm("덮어쓰기 주의")) {
        e.target.value='';
        return;
    }
    const r=new FileReader();
    r.onload=async ev=>{
        try{
            const d=JSON.parse(ev.target.result);
            if(!Array.isArray(d.library)) throw new Error('Invalid library');
            saveSafetyBackup('backup-restore');
            await applyRestoredState({
                library: d.library,
                settings: d.settings || settings,
                characters: d.characters || characterList,
                lastActive: d.lastActive,
            });
            await init();
            alert("완료");
        }catch(error){
            console.error("복원 실패", error);
            alert("실패");
        }
    };
    r.readAsText(f);
    e.target.value='';
}
function saveBlob(b,n){const u=window.URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=n;a.click();window.URL.revokeObjectURL(u);}
function applySettings(){if(settings.darkMode){document.body.classList.add('dark-mode');document.getElementById('themeBtn').innerText='☀️';}else{document.body.classList.remove('dark-mode');document.getElementById('themeBtn').innerText='🌙';}if(settings.autoSaveMin)autoSaveInput.value=settings.autoSaveMin;}
function toggleDarkMode(){settings.darkMode=!settings.darkMode;settings=sanitizeSettings(settings);localStorage.setItem('editorSettings',JSON.stringify(settings));applySettings();}
function handleFileSelect(event){
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    if (file.name.endsWith('.txt')) { reader.onload = function(e) { createNewChapter(file.name, escapeHtml(e.target.result).replace(/\n/g, '<br>')); }; reader.readAsText(file); }
    else if (file.name.endsWith('.docx')) { reader.onload = function(e) { mammoth.convertToHtml({ arrayBuffer: e.target.result }).then(function(result) { createNewChapter(file.name, result.value); }).catch(function(err) { alert("docx 오류"); }); }; reader.readAsArrayBuffer(file); }
    event.target.value = '';
}
async function createNewChapter(name, content) {
    await performSave({ syncCloud: false });
    const novel = getCurrentNovel();
    if(!novel) return;
    const newChapter = {
        id: Date.now(),
        title: toSafeText(name).replace(/\.(txt|docx)$/i, '') || '무제',
        content: sanitizeHtmlContent(content),
    };
    novel.chapters.push(newChapter);
    loadChapter(newChapter.id);
    renderNovelSidebar();
    saveLibrary();
}

editor.addEventListener('input', markAsUnsaved);
titleInput.addEventListener('input', markAsUnsaved);
autoSaveInput.addEventListener('change', startAutoSaveTimer);
fileInput.addEventListener('change', handleFileSelect);
backupInput.addEventListener('change', restoreData);
window.onbeforeunload=function(){if(hasUnsavedChanges)return "저장안됨";}

// [NEW] 소설 잠금/해제 기능
async function toggleLock(id) {
    const n = library.find(n => n.id === id);
    if (!n) return;

    if (isNovelLocked(n)) {
        const input = prompt("잠금을 해제하려면 현재 비밀번호를 입력하세요:");
        if (input === null) return;

        if (await verifyNovelPassword(n, input)) {
            delete n.password;
            delete n.passwordLock;
            alert("잠금이 해제되었습니다.");
            saveLibrary();
            renderLibrary();
        } else {
            alert("비밀번호가 틀렸습니다.");
        }
    } else {
        const newPass = prompt("설정할 비밀번호를 입력하세요.\n(주의: 분실 시 복구가 어렵습니다)");
        if (newPass && newPass.trim() !== "") {
            const confirmPass = prompt("비밀번호 확인을 위해 한 번 더 입력해주세요.");
            if (newPass === confirmPass) {
                n.passwordLock = await createPasswordLock(newPass);
                delete n.password;
                alert("비밀번호가 설정되었습니다. 이제 열 때마다 비밀번호가 필요합니다.");
                saveLibrary();
                renderLibrary();
            } else {
                alert("비밀번호가 일치하지 않아 설정되지 않았습니다.");
            }
        }
    }
}

// ============================================================
// [NEW] 클라우드 히스토리 (게시판형 저장소) 시스템
// ============================================================

// 1. 현재 상태를 '새로운 게시글'처럼 저장 (스냅샷 생성)
async function saveSnapshot() {
    if (!currentUser) return alert("로그인이 필요한 기능입니다.");
    if (!confirm("현재 상태를 클라우드 히스토리에 박제하시겠습니까?\n(기존 데이터는 유지되고, 새로운 기록이 추가됩니다.)")) return;

    try {
        const now = new Date();
        syncActiveEditorToModel();
        saveLibrary();
        const state = getSnapshotState();
        const compressedLibrary = LZString.compressToUTF16(JSON.stringify(state.library));

        const snapshotData = {
            compressedData: compressedLibrary,
            isCompressed: true,
            settings: state.settings,
            characters: state.characters,
            lastActive: state.lastActive,
            savedAt: now.toISOString(),
            deviceInfo: navigator.userAgent,
            summary: `소설 ${state.library.length}개 / ${state.library.reduce((acc,cur)=>acc+cur.chapters.length,0)}개 챕터`
        };

        await addDoc(collection(db, "users", currentUser.uid, "snapshots"), snapshotData);
        alert("✅ 클라우드 히스토리에 안전하게 저장되었습니다.");
    } catch (e) {
        console.error("스냅샷 저장 실패", e);
        alert("저장 중 오류가 발생했습니다: " + e.message);
    }
}

// 2. 히스토리 목록 불러오기 (게시판 보기)
async function openSnapshotList() {
    if (!currentUser) return alert("로그인이 필요한 기능입니다.");
    
    const listContainer = document.getElementById('snapshotList');
    listContainer.replaceChildren();
    const loading = document.createElement('div');
    loading.style.padding = '20px';
    loading.style.textAlign = 'center';
    loading.textContent = '목록을 불러오는 중...';
    listContainer.appendChild(loading);
    document.getElementById('historyModal').style.display = 'block';

    try {
        // 최신순으로 20개만 가져오기
        const q = query(collection(db, "users", currentUser.uid, "snapshots"), orderBy("savedAt", "desc"), limit(20));
        const querySnapshot = await getDocs(q);

        listContainer.innerHTML = ''; // 초기화

        if (querySnapshot.empty) {
            const empty = document.createElement('div');
            empty.style.padding = '20px';
            empty.style.textAlign = 'center';
            empty.style.color = '#999';
            empty.textContent = '저장된 히스토리가 없습니다.';
            listContainer.appendChild(empty);
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const date = new Date(data.savedAt).toLocaleString();
            
            const item = document.createElement('div');
            item.className = 'history-item';

            const info = document.createElement('div');
            info.className = 'history-info';
            const dateEl = document.createElement('div');
            dateEl.className = 'history-date';
            dateEl.textContent = `📅 ${date}`;
            const summary = document.createElement('div');
            summary.className = 'history-summary';
            summary.textContent = data.summary || '내용 없음';

            const actions = document.createElement('div');
            actions.className = 'history-actions';
            const loadBtn = document.createElement('button');
            loadBtn.className = 'btn-tool';
            loadBtn.textContent = '불러오기';
            loadBtn.onclick = () => window.loadSnapshot(doc.id);
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '🗑️';
            deleteBtn.onclick = () => window.deleteSnapshot(doc.id);

            info.append(dateEl, summary);
            actions.append(loadBtn, deleteBtn);
            item.append(info, actions);
            listContainer.appendChild(item);
        });
    } catch (e) {
        console.error("목록 로드 실패", e);
        listContainer.replaceChildren();
        const errorMessage = document.createElement('div');
        errorMessage.style.color = 'red';
        errorMessage.style.textAlign = 'center';
        errorMessage.textContent = '목록을 불러오지 못했습니다.';
        listContainer.appendChild(errorMessage);
    }
}

// 3. 특정 스냅샷 불러오기 (복원)
window.loadSnapshot = async function(docId) {
    if (!confirm("이 데이터를 불러오시겠습니까?\n현재 작업 중인 내용은 이 데이터로 덮어씌워집니다!")) return;

   try {
        const docRef = doc(db, "users", currentUser.uid, "snapshots", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            let nextLibrary = null;
            if (data.isCompressed && data.compressedData) {
                const decompressed = LZString.decompressFromUTF16(data.compressedData);
                nextLibrary = JSON.parse(decompressed);
            } else if (data.library) {
                nextLibrary = data.library;
            }

            if (!Array.isArray(nextLibrary)) throw new Error('Invalid snapshot library');

            saveSafetyBackup('snapshot-restore');
            await applyRestoredState({
                library: nextLibrary,
                settings: data.settings || settings,
                characters: data.characters || characterList,
                lastActive: data.lastActive,
            });
            await init();
            document.getElementById('historyModal').style.display = 'none';
            alert("복원되었습니다! 과거의 데이터로 돌아왔습니다.");
        } else {
            alert("해당 데이터가 존재하지 않습니다.");
        }
    } catch (e) {
        console.error("복원 실패", e);
        alert("오류 발생: " + e.message);
    }
};

// 4. 스냅샷 삭제
window.deleteSnapshot = async function(docId) {
    if (!confirm("정말 이 기록을 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "users", currentUser.uid, "snapshots", docId));
        openSnapshotList(); // 목록 새로고침
    } catch (e) {
        alert("삭제 실패");
    }
};

// 5. 모달 닫기
window.closeHistoryModal = function() {
    document.getElementById('historyModal').style.display = 'none';
};

// 전역 함수로 등록
window.saveSnapshot = saveSnapshot;
window.openSnapshotList = openSnapshotList;

function loadSafetyBackups() {
    return readStoredJson(SAFETY_BACKUP_KEY, []).filter((backup) => backup?.id && backup?.data);
}

function writeSafetyBackups(backups) {
    localStorage.setItem(SAFETY_BACKUP_KEY, JSON.stringify(backups.slice(0, MAX_SAFETY_BACKUPS)));
}

function getSafetyBackupReasonLabel(reason) {
    return ({
        'backup-restore': '백업 복원 전',
        'snapshot-restore': '타임머신 복원 전',
        'safety-restore': '복구함 복원 전',
        'delete-novel': '소설 삭제 전',
        'delete-chapter': '챕터 삭제 전',
        'delete-character': '캐릭터 삭제 전',
    })[reason] || '자동 안전 백업';
}

function renderSafetyBackupList() {
    const list = document.getElementById('safetyBackupList');
    if (!list) return;
    list.replaceChildren();

    const backups = loadSafetyBackups();
    if (backups.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '20px';
        empty.style.textAlign = 'center';
        empty.style.color = '#999';
        empty.textContent = '저장된 안전 백업이 없습니다.';
        list.appendChild(empty);
        return;
    }

    backups.forEach((backup) => {
        const state = backup.data || {};
        const item = document.createElement('div');
        item.className = 'history-item';

        const info = document.createElement('div');
        info.className = 'history-info';
        const date = document.createElement('div');
        date.className = 'history-date';
        date.textContent = `📅 ${new Date(backup.savedAt).toLocaleString()}`;
        const summary = document.createElement('div');
        summary.className = 'history-summary';
        summary.textContent = `${getSafetyBackupReasonLabel(backup.reason)} · 소설 ${Array.isArray(state.library) ? state.library.length : 0}개`;

        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn-tool';
        restoreBtn.textContent = '복원';
        restoreBtn.onclick = () => restoreSafetyBackup(backup.id);
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '🗑️';
        deleteBtn.onclick = () => deleteSafetyBackup(backup.id);

        info.append(date, summary);
        actions.append(restoreBtn, deleteBtn);
        item.append(info, actions);
        list.appendChild(item);
    });
}

function openSafetyBackupList() {
    renderSafetyBackupList();
    const modal = document.getElementById('safetyModal');
    if (modal) modal.style.display = 'block';
}

function closeSafetyBackupList() {
    const modal = document.getElementById('safetyModal');
    if (modal) modal.style.display = 'none';
}

async function restoreSafetyBackup(id) {
    const backups = loadSafetyBackups();
    const backup = backups.find((item) => item.id === id);
    if (!backup) return alert('백업을 찾을 수 없습니다.');
    if (!Array.isArray(backup.data?.library)) return alert('백업 데이터가 올바르지 않습니다.');
    if (!confirm('이 안전 백업으로 복원할까요? 현재 상태는 다시 안전 백업으로 남깁니다.')) return;

    saveSafetyBackup('safety-restore');
    await applyRestoredState(backup.data);
    await init();
    closeSafetyBackupList();
    alert('복원되었습니다.');
}

function deleteSafetyBackup(id) {
    if (!confirm('이 안전 백업을 삭제할까요?')) return;
    writeSafetyBackups(loadSafetyBackups().filter((backup) => backup.id !== id));
    renderSafetyBackupList();
}

window.openSafetyBackupList = openSafetyBackupList;
window.closeSafetyBackupList = closeSafetyBackupList;
window.restoreSafetyBackup = restoreSafetyBackup;
window.deleteSafetyBackup = deleteSafetyBackup;

// ============================================================
// [NEW] 캐릭터 설정집 시스템
// ============================================================

// 1. 모달 토글
window.toggleCharacterModal = function() {
    const modal = document.getElementById('characterModal');
    if (modal.style.display === 'none') {
        modal.style.display = 'flex';
        window.renderCharacterList();
    } else {
        modal.style.display = 'none';
        performSave(); // 닫을 때 자동 저장
    }
};

// 2. 캐릭터 목록 렌더링
window.renderCharacterList = function() {
    const listEl = document.getElementById('characterList');
    listEl.innerHTML = '';
    characterList = sanitizeCharacters(characterList);

    characterList.forEach(char => {
        const div = document.createElement('div');
        div.className = `char-item ${char.id === selectedCharId ? 'active' : ''}`;
        div.onclick = () => window.selectCharacter(char.id);

        const avatar = document.createElement('div');
        avatar.className = 'char-avatar';
        avatar.textContent = char.name ? char.name[0] : '?';

        const info = document.createElement('div');
        info.className = 'char-info';
        const name = document.createElement('div');
        name.className = 'char-name';
        name.textContent = char.name || '이름 없음';
        const role = document.createElement('div');
        role.className = 'char-sub';
        role.textContent = char.role || '역할 미정';

        info.append(name, role);
        div.append(avatar, info);
        listEl.appendChild(div);
    });
};

// 3. 새 캐릭터 추가
window.addNewCharacter = function() {
    const newChar = {
        id: Date.now(),
        name: '새 캐릭터',
        age: '',
        role: '',
        appearance: '',
        personality: ''
    };
    characterList.push(newChar);
    window.selectCharacter(newChar.id);
    window.renderCharacterList();
};

// 4. 캐릭터 선택
window.selectCharacter = function(id) {
    selectedCharId = id;
    const char = characterList.find(c => c.id === id);
    if (!char) return;
    
    document.getElementById('charDetailForm').style.display = 'block';
    document.getElementById('charEmptyState').style.display = 'none';

    // 입력창에 값 채우기
    document.getElementById('charName').value = toSafeText(char.name);
    document.getElementById('charAge').value = toSafeText(char.age);
    document.getElementById('charRole').value = toSafeText(char.role);
    document.getElementById('charAppearance').value = toSafeText(char.appearance);
    document.getElementById('charPersonality').value = toSafeText(char.personality);

    window.renderCharacterList(); // 선택 효과 갱신
};

// 5. 현재 입력 내용 저장 (입력할 때마다 혹은 저장 버튼 누를 때)
window.saveCurrentCharacter = function() {
    if (!selectedCharId) return;
    const char = characterList.find(c => c.id === selectedCharId);
    if (!char) return;

    char.name = toSafeText(document.getElementById('charName').value);
    char.age = toSafeText(document.getElementById('charAge').value);
    char.role = toSafeText(document.getElementById('charRole').value);
    char.appearance = toSafeText(document.getElementById('charAppearance').value);
    char.personality = toSafeText(document.getElementById('charPersonality').value);

    window.renderCharacterList(); // 목록의 이름/역할 갱신
    alert("캐릭터 설정이 저장되었습니다.");
    saveLibrary(); // 로컬 및 클라우드 저장 트리거
};

// 6. 캐릭터 삭제
window.deleteCurrentCharacter = function() {
    if (!selectedCharId) return;
    if (!confirm("정말 이 캐릭터를 삭제하시겠습니까?")) return;

    saveSafetyBackup('delete-character');
    characterList = characterList.filter(c => c.id !== selectedCharId);
    selectedCharId = null;
    
    document.getElementById('charDetailForm').style.display = 'none';
    document.getElementById('charEmptyState').style.display = 'flex';
    
    window.renderCharacterList();
    saveLibrary();
};
