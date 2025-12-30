// ============================================================
// [1] Firebase SDK 설정
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

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
let settings = JSON.parse(localStorage.getItem('editorSettings')) || { darkMode: false, autoSaveMin: 3, targetCount: 5000, goalType: 'space' };

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

// [NEW] 안내창 관련 요소
const btnShowInfo = document.getElementById('btnShowInfo');
const infoModal = document.getElementById('infoModal');
const btnCloseInfo = document.getElementById('btnCloseInfo');

const titleInput = document.getElementById('titleInput');
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

// 비로그인 시작 버튼
btnGuest.addEventListener('click', () => {
    loginOverlay.style.display = 'none';
    if (userInfoDisplay) userInfoDisplay.innerText = '비로그인 (로컬 모드)';
    currentUser = null;
    init(); 
});

// [NEW] 안내창 열기/닫기
btnShowInfo.addEventListener('click', () => {
    infoModal.style.display = 'flex';
});
btnCloseInfo.addEventListener('click', () => {
    infoModal.style.display = 'none';
});

// 로그인 상태 모니터링
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

// ... (이하 나머지 코드는 기존과 완벽히 동일) ...

// ============================================================
// [4] 클라우드 동기화
// ============================================================
async function syncFromCloud(uid) {
    sidebarStatus.innerText = "동기화 중...";
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
                    sidebarStatus.innerText = "서버 업데이트 완료";
                } else {
                    applyServerData(serverData);
                    sidebarStatus.innerText = "서버 데이터 로드";
                }
            } else {
                applyServerData(serverData);
                sidebarStatus.innerText = "동기화 완료";
            }
        } else {
            await saveToCloud();
        }
    } catch (e) {
        console.error(e);
        sidebarStatus.innerText = "동기화 실패";
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

function init() {
    applySettings();
    checkMigration();
    if (library.length === 0) createNovel("새 소설");
    renderLibrary();
    startAutoSaveTimer();
    enableDragAndDrop();
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

function renderLibrary() {
    viewMode = 'library'; currentNovelId = null;
    sidebarTitle.innerText = "내 서재";
    sidebarTitle.ondblclick = null; sidebarTitle.style.cursor = "default"; sidebarTitle.title = "";
    sidebarActionBtn.title = "새 소설"; sidebarActionBtn.onclick = createNovelPrompt;
    sidebarStatus.innerText = `총 ${library.length}개`;
    libraryHomeBtn.style.display = 'none'; 
    sidebarListEl.innerHTML = '';
    library.forEach(n => {
        const li = document.createElement('li'); li.className = 'list-item novel-item';
        li.innerHTML = `<div style="display:flex; align-items:center;"><span class="novel-icon">📘</span><span>${n.title}</span></div><button class="delete-btn">🗑️</button>`;
        li.onclick = (e) => { if (e.target.classList.contains('delete-btn')) { deleteNovel(n.id); return; } openNovel(n.id); };
        sidebarListEl.appendChild(li);
    });
}

function createNovelPrompt() { const t = prompt("제목:", "새 작품"); if (t) createNovel(t); }
function createNovel(t) { library.push({ id: Date.now(), title: t, chapters: [{ id: Date.now(), title: '1화', content: '' }], memo: '' }); saveLibrary(); renderLibrary(); }
function deleteNovel(id) { if(!confirm("삭제?")) return; library = library.filter(n => n.id !== id); saveLibrary(); renderLibrary(); }
function openNovel(id) {
    const n = library.find(n => n.id === id); if (!n) return;
    currentNovelId = id; memoTextarea.value = n.memo || '';
    if (n.chapters.length > 0) currentChapterId = n.chapters[0].id;
    else { const c = { id: Date.now(), title: '1화', content: '' }; n.chapters.push(c); currentChapterId = c.id; }
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
    sidebarStatus.innerText = "드래그 정렬 가능"; libraryHomeBtn.style.display = 'inline-block';
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

function performSave() {
    if (viewMode === 'library') return;
    const n = getCurrentNovel(); if (!n) return;
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
    updateUnsavedIndicator();
    setTimeout(() => { lastSavedDisplay.style.color = '#aaa'; }, 2000);
}

function saveLibrary() { 
    localStorage.setItem('novelLibrary', JSON.stringify(library)); 
    localStorage.setItem('localLastUpdated', new Date().toISOString());
}

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