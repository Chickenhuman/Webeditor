const APP_VERSION = "Ver 1.1.3";
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
let viewMode = 'library';
let currentUser = null;
let isLoginMode = true; 

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

function applyServerData(data) {
    if (data.library) {
        library = data.library;
        localStorage.setItem('novelLibrary', JSON.stringify(library));
    }
    if (data.settings) {
        settings = data.settings;
        localStorage.setItem('editorSettings', JSON.stringify(settings));
    }
    localStorage.setItem('localLastUpdated', data.lastUpdated);
}

async function saveToCloud() {
    if (!currentUser) return;
    try {
        const now = new Date().toISOString();
        await setDoc(doc(db, "users", currentUser.uid), {
            library: library,
            settings: settings,
            lastUpdated: now
        });
        localStorage.setItem('localLastUpdated', now);
    } catch (e) { console.error("저장 실패", e); }
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
    if (document.activeElement !== editor && document.activeElement !== htmlEditor) return;
    if ((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key.toLowerCase()==='z') { e.preventDefault(); performUndo(); }
    if ((e.ctrlKey||e.metaKey) && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'))) { e.preventDefault(); performRedo(); }
});
editor.addEventListener('beforeinput', () => {
    if (!historyDebounceTimer) recordHistory();
    clearTimeout(historyDebounceTimer);
    historyDebounceTimer = setTimeout(() => { historyDebounceTimer = null; }, 1000);
});

// [중요] 초기화 로직 수정
function init() {
    applySettings();
    checkMigration();
    renderSymbolButtons(); // [NEW]
    // 소설이 없으면 생성
    if (library.length === 0) {
        createNovel("새 소설");
    } else {
        // [NEW] 소설이 있으면 가장 최근(첫번째) 소설 자동 열기
        openNovel(library[0].id);
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

// [수정됨] 소설 열기 (비밀번호 체크 로직 추가)
function openNovel(id) {
    const n = library.find(n => n.id === id); 
    if (!n) return;

    // [NEW] 비밀번호가 있으면 확인
    if (n.password) {
        const input = prompt("🔒 이 소설은 비밀번호로 보호되어 있습니다.\n비밀번호를 입력하세요:");
        // 취소했거나 비밀번호가 틀리면 열지 않음
        if (input === null) return; 
        if (input !== n.password) {
            alert("비밀번호가 일치하지 않습니다.");
            return;
        }
    }

    // --- 기존 로직 그대로 실행 ---
    currentNovelId = id; memoTextarea.value = n.memo || '';
    if (n.chapters.length > 0) currentChapterId = n.chapters[0].id;
    else { const c = { id: Date.now(), title: '1화', content: '' }; n.chapters.push(c); currentChapterId = c.id; }
    
    editorWrapper.style.display = 'flex';
    
    renderNovelSidebar(); loadChapter(currentChapterId);
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

function loadChapter(id) { const n = getCurrentNovel(); const c = n.chapters.find(ch => ch.id === id); if (c) { currentChapterId = id; titleInput.value = c.title; editor.innerHTML = c.content; htmlEditor.value = c.content; undoStack=[]; redoStack=[]; hasUnsavedChanges = false; updateUnsavedIndicator(); updateCount(); renderNovelSidebar(); } }
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
editor.addEventListener('paste', e => { if(isHtmlMode)return; e.preventDefault(); recordHistory(); document.execCommand('insertText',false,(e.clipboardData||window.clipboardData).getData('text/plain')); markAsUnsaved(); });
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
        const snapshotData = {
            library: library,
            settings: settings,
            savedAt: now.toISOString(),
            deviceInfo: navigator.userAgent, // 어떤 기기에서 저장했는지 식별용
            summary: `소설 ${library.length}개 / ${library.reduce((acc,cur)=>acc+cur.chapters.length,0)}개 챕터`
        };

        // users 컬렉션 -> 내 UID -> snapshots 서브 컬렉션에 추가 (addDoc은 덮어쓰지 않고 추가함)
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
            library = data.library || [];
            settings = data.settings || settings;
            
            saveLibrary(); // 로컬에 반영
            renderLibrary(); // 화면 갱신
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


