// ============================================================
// [1] Firebase SDK 설정
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
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

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================================
// [2] 전역 변수 및 DOM 요소
// ============================================================
let library = JSON.parse(localStorage.getItem('novelLibrary')) || [];
let currentNovelId = null; 
let currentChapterId = null;
let settings = JSON.parse(localStorage.getItem('editorSettings')) || { darkMode: false, autoSaveMin: 3, targetCount: 5000, goalType: 'space' };

// 히스토리 관리 변수 (Undo/Redo)
const MAX_HISTORY = 50;
let undoStack = [];
let redoStack = [];
let historyDebounceTimer = null;

let autoSaveTimerId = null;
let hasUnsavedChanges = false;
let isHtmlMode = false;
let viewMode = 'library';
let currentUser = null;

// DOM 요소 선택
const loginOverlay = document.getElementById('loginOverlay');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const btnLogin = document.getElementById('btnLogin');
const btnSignup = document.getElementById('btnSignup');
const loginMessage = document.getElementById('loginMessage');
const btnLogout = document.getElementById('btnLogout');
const userInfoDisplay = document.getElementById('userInfoDisplay');

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
// [3] 인증 및 클라우드 동기화 (충돌 방지 로직 추가)
// ============================================================

// 로그인 상태 모니터링
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        loginOverlay.style.display = 'none';
        if(userInfoDisplay) userInfoDisplay.innerText = user.email.split('@')[0] + '님';
        
        await syncFromCloud(user.uid); // 동기화 시작
        init(); 
    } else {
        currentUser = null;
        loginOverlay.style.display = 'flex';
        if(userInfoDisplay) userInfoDisplay.innerText = '비로그인';
    }
});

// [중요] 클라우드 동기화 (충돌 해결 로직 포함)
async function syncFromCloud(uid) {
    sidebarStatus.innerText = "클라우드 데이터 확인 중...";
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const serverData = docSnap.data();
            
            // 1. 시간 비교
            const serverTime = new Date(serverData.lastUpdated || 0).getTime();
            const localTimeStr = localStorage.getItem('localLastUpdated');
            const localTime = localTimeStr ? new Date(localTimeStr).getTime() : 0;

            console.log(`로컬 시간: ${new Date(localTime).toLocaleString()} / 서버 시간: ${new Date(serverTime).toLocaleString()}`);

            if (localTime > serverTime) {
                // [충돌 발생] 로컬이 더 최신임 -> 사용자에게 질문
                const userChoice = confirm(
                    `[⚠️ 데이터 충돌 감지]\n\n로컬 데이터가 클라우드보다 더 최신입니다!\n(아마도 오프라인 작업 후 로그인하신 것 같습니다)\n\n- 로컬 저장: ${new Date(localTime).toLocaleString()}\n- 서버 저장: ${new Date(serverTime).toLocaleString()}\n\n[확인]을 누르면 👉 로컬 데이터로 서버를 덮어씁니다. (로컬 유지)\n[취소]를 누르면 👉 서버 데이터를 가져옵니다. (로컬 삭제)`
                );

                if (userChoice) {
                    // 사용자 선택: 로컬 유지 (서버에 업로드)
                    await saveToCloud();
                    sidebarStatus.innerText = "로컬 버전으로 서버 동기화 완료";
                } else {
                    // 사용자 선택: 서버 데이터 가져오기
                    applyServerData(serverData);
                    sidebarStatus.innerText = "서버 데이터 로드 완료";
                }
            } else {
                // 서버가 더 최신이거나 같음 -> 그냥 가져옴 (안전)
                applyServerData(serverData);
                sidebarStatus.innerText = "동기화 완료";
            }
        } else {
            // 서버에 데이터 없음 (신규) -> 업로드
            await saveToCloud();
        }
    } catch (e) {
        console.error("동기화 오류:", e);
        sidebarStatus.innerText = "동기화 실패 (오프라인)";
    }
}

// 서버 데이터를 로컬에 적용하는 함수
function applyServerData(data) {
    if (data.library) {
        library = data.library;
        localStorage.setItem('novelLibrary', JSON.stringify(library));
    }
    if (data.settings) {
        settings = data.settings;
        localStorage.setItem('editorSettings', JSON.stringify(settings));
    }
    // 서버 시간을 로컬 시간으로 맞춤 (동기화 완료)
    localStorage.setItem('localLastUpdated', data.lastUpdated); 
}

// 클라우드 저장
async function saveToCloud() {
    if (!currentUser) return;
    
    try {
        const now = new Date().toISOString();
        await setDoc(doc(db, "users", currentUser.uid), {
            library: library,
            settings: settings,
            lastUpdated: now
        });
        // 저장 성공 시 로컬 시간도 갱신하여 동기화 상태 유지
        localStorage.setItem('localLastUpdated', now); 
    } catch (e) {
        console.error("클라우드 저장 실패:", e);
    }
}

// --- 인증 버튼 이벤트 ---
if(btnSignup) btnSignup.addEventListener('click', () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if(!email || !password) return alert("입력 정보 확인");
    createUserWithEmailAndPassword(auth, email, password)
        .then(() => alert("가입 성공!"))
        .catch((e) => loginMessage.innerText = e.message);
});

if(btnLogin) btnLogin.addEventListener('click', () => {
    signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value)
        .catch((e) => loginMessage.innerText = "로그인 실패");
});

if(btnLogout) btnLogout.addEventListener('click', () => {
    if(confirm("로그아웃 하시겠습니까?")) signOut(auth).then(() => location.reload());
});

// ============================================================
// [4] 히스토리 매니저 (Undo/Redo)
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

// ============================================================
// [5] 에디터 핵심 로직
// ============================================================
function init() {
    applySettings();
    checkMigration();
    if (library.length === 0) createNovel("새 소설");
    renderLibrary();
    startAutoSaveTimer();
    enableDragAndDrop();
}

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

// [핵심] 저장 로직 (시간 기록 추가)
function performSave() {
    if (viewMode === 'library') return;
    const n = getCurrentNovel(); if (!n) return;
    if (isHtmlMode) editor.innerHTML = htmlEditor.value;
    const c = n.chapters.find(ch => ch.id === currentChapterId);
    if (c) { c.title = titleInput.value; c.content = editor.innerHTML; }
    n.memo = memoTextarea.value;
    
    saveLibrary(); // 로컬 저장 (시간 갱신됨)
    
    if (currentUser) {
        saveToCloud(); // 클라우드 저장
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
    // 로컬 저장 시 타임스탬프 갱신
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