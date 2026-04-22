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

// ============================================================
// [2] 전역 변수
// ============================================================
let library = JSON.parse(localStorage.getItem('novelLibrary')) || [];
let currentNovelId = null; 
let currentChapterId = null;

/* ▼▼▼ 아래 코드를 여기에 붙여넣으세요 ▼▼▼ */
const defaultSymbols = "「」, 『』, (), [], “”, ─, …, ★, ※"; 
let settings = JSON.parse(localStorage.getItem('editorSettings')) || { 
    darkMode: false, 
    autoSaveMin: 3, 
    targetCount: 5000, 
    goalType: 'space',
    customSymbols: defaultSymbols 
};
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
let characterList = JSON.parse(localStorage.getItem('characterList')) || []; // 캐릭터 데이터
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
    btnGuest.addEventListener('click', () => {
        loginOverlay.style.display = 'none';
        if (userInfoDisplay) userInfoDisplay.innerText = '비로그인 (로컬 모드)';
        currentUser = null;
        init(); 
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
        init();
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
                    applyServerData(serverData);
                    if(sidebarStatus) sidebarStatus.innerText = "서버 데이터 로드";
                }
            } else {
                applyServerData(serverData);
                if(sidebarStatus) sidebarStatus.innerText = "동기화 완료";
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
// script.js의 applyServerData 함수 전체를 이것으로 교체하세요
function applyServerData(data) {
    // [수정됨] 압축된 데이터인지 확인 후 해제
    if (data.isCompressed && data.compressedLibrary) {
        try {
            const decompressed = LZString.decompressFromUTF16(data.compressedLibrary);
            library = JSON.parse(decompressed);
        } catch (e) {
            console.error("압축 해제 실패", e);
            // 만약 실패하면 기존 데이터 유지하거나 빈 배열
        }
    } else if (data.library) {
        // 구버전(압축 안 된) 데이터 호환성 유지
        library = data.library;
    }

    // 로컬 스토리지에 반영
    localStorage.setItem('novelLibrary', JSON.stringify(library));

    if (data.settings) {
        settings = data.settings;
        localStorage.setItem('editorSettings', JSON.stringify(settings));
    }
    if (data.characters) {
        characterList = data.characters;
        localStorage.setItem('characterList', JSON.stringify(characterList));
    }
    if (data.lastActive) {
        localStorage.setItem('editorLastActive', JSON.stringify(data.lastActive));
    }
    
    // 타임스탬프 업데이트
    if (data.lastUpdated) {
        localStorage.setItem('localLastUpdated', data.lastUpdated);
    }
}
async function saveToCloud() {
    if (!currentUser) return;
    try {
        const now = new Date().toISOString();
        
        // [수정됨] 메인 저장소도 라이브러리를 압축합니다!
        const compressedLibrary = LZString.compressToUTF16(JSON.stringify(library));

        await setDoc(doc(db, "users", currentUser.uid), {
            // library: library,  <-- 원본 제거 (용량 초과 원인)
            compressedLibrary: compressedLibrary, // <-- 압축된 데이터
            isCompressed: true, // <-- 압축 여부 표시
            
            settings: settings,
            characters: characterList,
            lastUpdated: now,
            lastActive: { novelId: currentNovelId, chapterId: currentChapterId }
        });
        localStorage.setItem('localLastUpdated', now);
    } catch (e) { 
        console.error("저장 실패", e); 
        // 용량 초과 시 사용자에게 알림
        if(e.code === 'resource-exhausted') {
             alert("⚠️ 저장 실패: 데이터 용량이 너무 큽니다. 불필요한 내용을 정리해주세요.");
        }
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
function init() {
    applySettings();
    checkMigration();
    renderSymbolButtons();
    
    // 소설이 없으면 생성
    if (library.length === 0) {
        createNovel("새 소설");
    } else {
        // [NEW] 저장된 마지막 위치(editorLastActive)가 있는지 확인
        const lastActive = JSON.parse(localStorage.getItem('editorLastActive'));
        
        // 마지막 위치 정보가 있고, 해당 소설이 실제로 존재하면 그 ID 사용
        let targetNovelId = library[0].id; // 기본값: 첫 번째 소설
        if (lastActive && library.find(n => n.id === lastActive.novelId)) {
            targetNovelId = lastActive.novelId;
        }

        // 1. 소설 열기 (기본적으로 1화가 열림)
        openNovel(targetNovelId);

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
        const parsed = JSON.parse(old);
        if (Array.isArray(parsed)) {
            library.push({ id: Date.now(), title: "복구된 소설", chapters: parsed, memo: localStorage.getItem('editorMemo')||'' });
            localStorage.setItem('novelLibrary', JSON.stringify(library));
            localStorage.removeItem('myNovelData');
            localStorage.removeItem('editorMemo');
            alert("이전 데이터 복구됨");
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
        
        // 잠금 상태 확인
        const isLocked = !!n.password;
        const icon = isLocked ? '🔒' : '📘';
        const lockBtnTitle = isLocked ? '잠금 해제' : '비밀번호 설정';
        const lockBtnIcon = isLocked ? '🔓' : '🔐';

        li.innerHTML = `
            <div style="display:flex; align-items:center; overflow:hidden;">
                <span class="novel-icon">${icon}</span>
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${n.title}</span>
            </div>
            <div class="novel-actions">
                <button class="lock-btn" title="${lockBtnTitle}">${lockBtnIcon}</button>
                <button class="delete-btn" title="삭제">🗑️</button>
            </div>
        `;
        
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
function createNovel(t) { library.push({ id: Date.now(), title: t, chapters: [{ id: Date.now(), title: '1화', content: '' }], memo: '' }); saveLibrary(); renderLibrary(); }
function deleteNovel(id) { if(!confirm("삭제?")) return; library = library.filter(n => n.id !== id); saveLibrary(); renderLibrary(); }

// [수정됨] 소설 열기 (중복 제거 및 최적화 완료)
function openNovel(id) {
    const n = library.find(n => n.id === id); 
    if (!n) return;

    // [NEW] 비밀번호가 있으면 확인
    if (n.password) {
        const input = prompt("🔒 이 소설은 비밀번호로 보호되어 있습니다.\n비밀번호를 입력하세요:");
        
        // 1. [버그 수정] 취소 버튼을 눌렀을 때 -> 서재 목록으로 안전하게 복귀
        if (input === null) {
            renderLibrary(); 
            return; 
        }
        
        // 2. 비밀번호가 틀렸을 때 -> 경고창 띄우고 서재로 쫓아냄
        if (input !== n.password) {
            alert("비밀번호가 일치하지 않습니다.");
            renderLibrary(); // [버그 수정] UI 멈춤 방지
            return;
        }
    }

    // --- 기존 로직 (비밀번호 통과 시 실행) ---
    currentNovelId = id; memoTextarea.value = n.memo || '';
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
        const inp = document.createElement('input'); inp.value = n.title; inp.className = 'title-edit-input';
        sidebarTitle.innerHTML=''; sidebarTitle.appendChild(inp); inp.focus();
        const finish = () => { if(inp.value.trim() && inp.value!==n.title){ n.title=inp.value.trim(); saveLibrary(); } renderNovelSidebar(); };
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
        li.innerHTML = `<span>${c.title||'무제'}</span><button class="delete-btn">✕</button>`;
        li.onclick = (e) => { if(e.target.classList.contains('delete-btn')) { deleteChapter(c.id); return; } switchChapter(c.id); };
        sidebarListEl.appendChild(li);
    });
}

function addNewChapter() { performSave(); const n = getCurrentNovel(); n.chapters.push({ id: Date.now(), title: `${n.chapters.length+1}화`, content: '' }); loadChapter(n.chapters[n.chapters.length-1].id); renderNovelSidebar(); }
function deleteChapter(id) { const n = getCurrentNovel(); if(n.chapters.length<=1) return alert("최소 1개 필요"); if(!confirm("삭제?")) return; n.chapters = n.chapters.filter(c => c.id!==id); if(currentChapterId===id) loadChapter(n.chapters[0].id); else renderNovelSidebar(); saveLibrary(); }
function getCurrentNovel() { return library.find(n => n.id === currentNovelId); }

function enableDragAndDrop() {
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
    const c = n.chapters.find(ch => ch.id === id); 
    if (c) { 
        currentChapterId = id; 
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
function switchChapter(id) { performSave(); loadChapter(id); }
// [수정됨] 저장 로직 (메시지 덮어쓰기 버그 수정)
function performSave() {
    if (viewMode === 'library') return;
    const n = getCurrentNovel(); 
    // [안전장치] 소설이 없으면 저장 중단
    if (!n) {
        console.warn("저장할 소설이 선택되지 않았습니다.");
        return; 
    }
    
    if (isHtmlMode) editor.innerHTML = htmlEditor.value;
    const c = n.chapters.find(ch => ch.id === currentChapterId);
    if (c) { c.title = titleInput.value; c.content = editor.innerHTML; }
    n.memo = memoTextarea.value;
    
    saveLibrary();
    
    if (currentUser) {
        saveToCloud();
        lastSavedDisplay.innerText = "저장됨(Cloud)";
        lastSavedDisplay.style.color = '#4a90e2';
    } else {
        lastSavedDisplay.innerText = "저장됨(Local)";
        lastSavedDisplay.style.color = '#2ecc71';
    }
    
    hasUnsavedChanges = false;
    // [중요] updateUnsavedIndicator() 호출 제거
    // (이 함수가 '준비됨'으로 텍스트를 즉시 덮어쓰기 때문)
    unsavedDot.style.display = 'none'; // 점만 끈다
    
    setTimeout(() => { lastSavedDisplay.style.color = '#aaa'; }, 2000);
}

function saveLibrary() { 
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
    const val = symbolInput.value;
    settings.customSymbols = val; // 설정 객체 업데이트
    localStorage.setItem('editorSettings', JSON.stringify(settings)); // 로컬 저장
    
    // 클라우드 저장 (로그인 상태라면)
    if (currentUser) saveToCloud();
    
    renderSymbolButtons(); // 버튼 다시 그리기
    window.closeSymbolEditor(); // 창 닫기
    alert("기호 설정이 저장되었습니다.");
};

function startAutoSaveTimer() { if (autoSaveTimerId) clearInterval(autoSaveTimerId); const m = parseInt(autoSaveInput.value) || 3; settings.autoSaveMin = m; localStorage.setItem('editorSettings', JSON.stringify(settings)); autoSaveTimerId = setInterval(() => { if (hasUnsavedChanges) performSave(); }, m * 60 * 1000); }
function markAsUnsaved() { if (!hasUnsavedChanges) { hasUnsavedChanges = true; updateUnsavedIndicator(); } updateCount(); }
function updateUnsavedIndicator() { unsavedDot.style.display = hasUnsavedChanges ? 'inline-block' : 'none'; lastSavedDisplay.innerText = hasUnsavedChanges ? '저장 안됨' : '준비됨'; }
function updateCount() { let t = editor.innerText || ''; charCountEl.innerText = t.length; charCountNoSpaceEl.innerText = t.replace(/\s/g, '').length; updateGoalProgress(); }
function updateGoalProgress() { const t = parseInt(targetCountInput.value) || 5000; const type = goalTypeSelect.value; let curr = (type === 'nospace') ? parseInt(charCountNoSpaceEl.innerText) : parseInt(charCountEl.innerText); let p = (curr / t) * 100; if (p > 100) p = 100; goalProgressBar.style.width = `${p}%`; goalPercentage.innerText = `${Math.floor((curr/t)*100)}%`; }

targetCountInput.addEventListener('input', () => { settings.targetCount = targetCountInput.value; localStorage.setItem('editorSettings', JSON.stringify(settings)); updateGoalProgress(); });
goalTypeSelect.addEventListener('change', () => { settings.goalType = goalTypeSelect.value; localStorage.setItem('editorSettings', JSON.stringify(settings)); updateGoalProgress(); });
memoTextarea.addEventListener('input', () => markAsUnsaved());

function insertSymbol(o, c) { if(isHtmlMode)return; recordHistory(); document.execCommand('insertText',false,o+c); if(c){const s=window.getSelection(),r=s.getRangeAt(0);r.setStart(r.startContainer,r.startOffset-1);r.setEnd(r.startContainer,r.startOffset-1);s.removeAllRanges();s.addRange(r);} editor.focus(); markAsUnsaved(); }
function toggleMemoPanel() { memoPanel.classList.toggle('open'); }
function toggleHtmlMode() { isHtmlMode=!isHtmlMode; if(isHtmlMode){htmlEditor.value=editor.innerHTML;editor.style.display='none';htmlEditor.style.display='block';}else{editor.innerHTML=htmlEditor.value;htmlEditor.style.display='none';editor.style.display='block';updateCount();} }
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
function findAndReplace(){ const f=findInput.value,r=replaceInput.value; if(!f||isHtmlMode)return; if(!confirm('변경?'))return; const c=editor.innerHTML; const n=c.split(f).join(r); if(c===n)alert('없음'); else { recordHistory(); editor.innerHTML=n; markAsUnsaved(); toggleSearchModal(); alert('완료'); } }
function autoLineBreak(){ if(isHtmlMode)return; const o=document.getElementById('lineBreakOption').value,ig=document.getElementById('ignoreEllipsis').checked,br=(o==='2'?'<br><br>':'<br>'); let h=editor.innerHTML,rx=ig ? /("[^"]*")|((?<!\.)\.(\s|&nbsp;))/g : /("[^"]*")|(\.(\s|&nbsp;))/g; const n=h.replace(rx, (m,q)=>{ return q ? m : '.'+br; }); if(h!==n){ recordHistory(); editor.innerHTML=n; htmlEditor.value=n; markAsUnsaved(); alert('완료'); } else alert('변경없음'); }

function downloadAll(format) {
    const n = getCurrentNovel(); if(!n) return; performSave();
    if(!confirm(`${format.toUpperCase()} 저장?`)) return;
    if (format === 'txt') {
        let all = ""; const line = "\n\n====================\n\n";
        n.chapters.forEach((c,i)=>{ const t=document.createElement('div'); t.innerHTML=c.content.replace(/<br\s*\/?>/gi,"\n"); all+=`[${c.title}]\n\n${t.innerText}`; if(i<n.chapters.length-1)all+=line; });
        saveBlob(new Blob([all],{type:'text/plain'}), `${n.title}.txt`);
    } else if (format === 'docx') {
        let c = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>${n.title}</title><body>`;
        n.chapters.forEach(ch => { c += `<h1>${ch.title}</h1>${ch.content}<br><br>`; });
        c += `</body></html>`;
        if (typeof htmlDocx !== 'undefined') saveBlob(htmlDocx.asBlob(c), `${n.title}.docx`); else alert("Lib Error");
    }
}

function backupData() { performSave(); const d = { version: "9.0", backupDate: new Date().toISOString(), library: library, settings: settings }; saveBlob(new Blob([JSON.stringify(d, null, 2)],{type:'application/json'}), `Backup_${new Date().toISOString().slice(0,10)}.json`); }
function restoreData(e) { const f=e.target.files[0]; if(!f||!confirm("덮어쓰기 주의"))return; const r=new FileReader(); r.onload=ev=>{ try{const d=JSON.parse(ev.target.result); if(d.library)library=d.library; if(d.settings)settings=d.settings; saveLibrary(); localStorage.setItem('editorSettings',JSON.stringify(settings)); init(); alert("완료");}catch(e){alert("실패");}}; r.readAsText(f); e.target.value=''; }
function saveBlob(b,n){const u=window.URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=n;a.click();window.URL.revokeObjectURL(u);}
function applySettings(){if(settings.darkMode){document.body.classList.add('dark-mode');document.getElementById('themeBtn').innerText='☀️';}else{document.body.classList.remove('dark-mode');document.getElementById('themeBtn').innerText='🌙';}if(settings.autoSaveMin)autoSaveInput.value=settings.autoSaveMin;}
function toggleDarkMode(){settings.darkMode=!settings.darkMode;localStorage.setItem('editorSettings',JSON.stringify(settings));applySettings();}
function handleFileSelect(event){
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    if (file.name.endsWith('.txt')) { reader.onload = function(e) { createNewChapter(file.name, e.target.result.replace(/\n/g, '<br>')); }; reader.readAsText(file); } 
    else if (file.name.endsWith('.docx')) { reader.onload = function(e) { mammoth.convertToHtml({ arrayBuffer: e.target.result }).then(function(result) { createNewChapter(file.name, result.value); }).catch(function(err) { alert("docx 오류"); }); }; reader.readAsArrayBuffer(file); }
    event.target.value = '';
}
function createNewChapter(name, content) { performSave(); const novel = getCurrentNovel(); if(!novel) return; const newChapter = { id: Date.now(), title: name.replace(/\.(txt|docx)$/i, ''), content: content }; novel.chapters.push(newChapter); loadChapter(newChapter.id); renderNovelSidebar(); }

editor.addEventListener('input', markAsUnsaved);
titleInput.addEventListener('input', markAsUnsaved);
autoSaveInput.addEventListener('change', startAutoSaveTimer);
fileInput.addEventListener('change', handleFileSelect);
backupInput.addEventListener('change', restoreData);
window.onbeforeunload=function(){if(hasUnsavedChanges)return "저장안됨";}

// [NEW] 소설 잠금/해제 기능
function toggleLock(id) {
    const n = library.find(n => n.id === id);
    if (!n) return;

    if (n.password) {
        // 이미 잠긴 경우 -> 해제 시도
        const input = prompt("잠금을 해제하려면 현재 비밀번호를 입력하세요:");
        if (input === null) return;
        
        if (input === n.password) {
            delete n.password; // 비밀번호 삭제
            alert("잠금이 해제되었습니다.");
            saveLibrary();
            renderLibrary(); // 아이콘 변경을 위해 다시 렌더링
        } else {
            alert("비밀번호가 틀렸습니다.");
        }
    } else {
        // 잠기지 않은 경우 -> 잠금 설정
        const newPass = prompt("설정할 비밀번호를 입력하세요.\n(주의: 분실 시 복구가 어렵습니다)");
        if (newPass && newPass.trim() !== "") {
            const confirmPass = prompt("비밀번호 확인을 위해 한 번 더 입력해주세요.");
            if (newPass === confirmPass) {
                n.password = newPass; // 비밀번호 저장
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
        
        // [수정됨] 라이브러리(library) 전체를 문자열로 만들고 압축합니다.
        const compressedLibrary = LZString.compressToUTF16(JSON.stringify(library));

        const snapshotData = {
            // library: library,  <-- 기존 코드 삭제 (원본 저장 X)
            compressedData: compressedLibrary, // <-- 압축된 데이터 저장
            isCompressed: true, // 압축 여부 표시
            settings: settings,
            savedAt: now.toISOString(),
            deviceInfo: navigator.userAgent,
            summary: `소설 ${library.length}개 / ${library.reduce((acc,cur)=>acc+cur.chapters.length,0)}개 챕터`
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
    listContainer.innerHTML = '<div style="padding:20px; text-align:center;">목록을 불러오는 중...</div>';
    document.getElementById('historyModal').style.display = 'block';

    try {
        // 최신순으로 20개만 가져오기
        const q = query(collection(db, "users", currentUser.uid, "snapshots"), orderBy("savedAt", "desc"), limit(20));
        const querySnapshot = await getDocs(q);

        listContainer.innerHTML = ''; // 초기화

        if (querySnapshot.empty) {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">저장된 히스토리가 없습니다.</div>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const date = new Date(data.savedAt).toLocaleString();
            
            // 리스트 아이템 생성
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-info">
                    <div class="history-date">📅 ${date}</div>
                    <div class="history-summary">${data.summary || '내용 없음'}</div>
                </div>
                <div class="history-actions">
                    <button class="btn-tool" onclick="window.loadSnapshot('${doc.id}')">불러오기</button>
                    <button class="delete-btn" onclick="window.deleteSnapshot('${doc.id}')">🗑️</button>
                </div>
            `;
            listContainer.appendChild(item);
        });
    } catch (e) {
        console.error("목록 로드 실패", e);
        listContainer.innerHTML = '<div style="color:red; text-align:center;">목록을 불러오지 못했습니다.</div>';
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
            
            // [수정됨] 압축된 데이터인지 확인 후 해제
            if (data.isCompressed && data.compressedData) {
                const decompressed = LZString.decompressFromUTF16(data.compressedData);
                library = JSON.parse(decompressed);
            } else if (data.library) {
                // 예전 방식(압축 안 된 데이터)도 호환성 유지
                library = data.library;
            } else {
                library = [];
            }
            
            settings = data.settings || settings;
            
            saveLibrary(); 
            renderLibrary(); 
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

    characterList.forEach(char => {
        const div = document.createElement('div');
        div.className = `char-item ${char.id === selectedCharId ? 'active' : ''}`;
        div.onclick = () => window.selectCharacter(char.id);
        
        div.innerHTML = `
            <div class="char-avatar">${char.name ? char.name[0] : '?'}</div>
            <div class="char-info">
                <div class="char-name">${char.name || '이름 없음'}</div>
                <div class="char-sub">${char.role || '역할 미정'}</div>
            </div>
        `;
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
    
    document.getElementById('charDetailForm').style.display = 'block';
    document.getElementById('charEmptyState').style.display = 'none';

    // 입력창에 값 채우기
    document.getElementById('charName').value = char.name;
    document.getElementById('charAge').value = char.age || '';
    document.getElementById('charRole').value = char.role || '';
    document.getElementById('charAppearance').value = char.appearance || '';
    document.getElementById('charPersonality').value = char.personality || '';

    window.renderCharacterList(); // 선택 효과 갱신
};

// 5. 현재 입력 내용 저장 (입력할 때마다 혹은 저장 버튼 누를 때)
window.saveCurrentCharacter = function() {
    if (!selectedCharId) return;
    const char = characterList.find(c => c.id === selectedCharId);
    if (!char) return;

    char.name = document.getElementById('charName').value;
    char.age = document.getElementById('charAge').value;
    char.role = document.getElementById('charRole').value;
    char.appearance = document.getElementById('charAppearance').value;
    char.personality = document.getElementById('charPersonality').value;

    window.renderCharacterList(); // 목록의 이름/역할 갱신
    alert("캐릭터 설정이 저장되었습니다.");
    saveLibrary(); // 로컬 및 클라우드 저장 트리거
};

// 6. 캐릭터 삭제
window.deleteCurrentCharacter = function() {
    if (!selectedCharId) return;
    if (!confirm("정말 이 캐릭터를 삭제하시겠습니까?")) return;

    characterList = characterList.filter(c => c.id !== selectedCharId);
    selectedCharId = null;
    
    document.getElementById('charDetailForm').style.display = 'none';
    document.getElementById('charEmptyState').style.display = 'flex';
    
    window.renderCharacterList();
    saveLibrary();
};
