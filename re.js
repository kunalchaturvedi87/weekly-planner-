<script>
/* Single-file Weekly Planner (start + finish time) */

/* Data model:
 tasks = {0: [task...], ..., 6: [...]}
 task = { id, text, start:'HH:MM'|'', end:'HH:MM'|'', completed:false, createdAt, dueAt(ms), lastNotified(ms) }
*/

const STORAGE = 'weekly-planner-simple-v1';
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const CHECK_INTERVAL = 60 * 1000; // 60s

let tasks = loadTasks() || initEmpty();
let notifAllowed = (window.Notification && Notification.permission === 'granted');

const plannerEl = document.getElementById('planner');
const toastEl = document.getElementById('toast');
const upcomingEl = document.getElementById('upcoming');
const tomListEl = document.getElementById('tomList');

const quickText = document.getElementById('quickText');
const quickStart = document.getElementById('quickStart');
const quickEnd = document.getElementById('quickEnd');
const quickAdd = document.getElementById('quickAdd');

const tomText = document.getElementById('tomText');
const tomStart = document.getElementById('tomStart');
const tomEnd = document.getElementById('tomEnd');
const tomAdd = document.getElementById('tomAdd');

const notifBtn = document.getElementById('notifBtn');

/* Utility */
function initEmpty(){ const o={}; for(let i=0;i<7;i++) o[i]=[]; return o; }
function save(){ try{ localStorage.setItem(STORAGE, JSON.stringify(tasks)); }catch(e){ showToast('Save failed — localStorage issue'); } }
function loadTasks(){ try{ const r = localStorage.getItem(STORAGE); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function id(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;", '"':"&quot;","'":"&#39;" })[c]); }
function nowMs(){ return Date.now(); }
function showToast(msg, t=3500){ toastEl.textContent = msg; toastEl.style.display='block'; clearTimeout(toastEl._t); toastEl._t = setTimeout(()=> toastEl.style.display='none', t); }

/* Render planner (7 columns) */
function render(){
  plannerEl.innerHTML = '';
  for(let d=0; d<7; d++){
    const dayCol = document.createElement('div'); dayCol.className='day'; dayCol.dataset.day=d;
    const h = document.createElement('h4'); h.textContent = DAYS[d];
    dayCol.appendChild(h);

    const tasksWrap = document.createElement('div'); tasksWrap.className='tasks';
    // sort tasks by start time (present first) then createdAt
    const arr = tasks[d].slice().sort((a,b)=>{
      if(a.start && b.start) return a.start.localeCompare(b.start);
      if(a.start) return -1; if(b.start) return 1;
      return a.createdAt - b.createdAt;
    });

    arr.forEach(t=>{
      const tdiv = document.createElement('div'); tdiv.className='task'; if(t.completed) tdiv.classList.add('completed'); tdiv.dataset.id=t.id;
      const tick = document.createElement('div'); tick.className='tick'; tick.title = t.completed ? 'Mark undone' : 'Mark done'; tick.innerHTML = t.completed ? '✓' : '';
      tick.onclick = ()=> toggleComplete(d, t.id);

      const meta = document.createElement('div'); meta.className='meta';
      const title = document.createElement('div'); title.className='titleTxt'; title.innerHTML = escapeHtml(t.text);
      const time = document.createElement('div'); time.className='timeTxt';
      if(t.start || t.end) time.textContent = `${t.start || '--:--'} → ${t.end || '--:--'}`;
      meta.appendChild(title); meta.appendChild(time);

      const acts = document.createElement('div'); acts.className='acts';
      const edit = document.createElement('button'); edit.className='btn'; edit.textContent='Edit'; edit.onclick=()=> editTask(d,t.id);
      const del = document.createElement('button'); del.className='btn'; del.textContent='Delete'; del.onclick=()=> { if(confirm('Delete task?')) removeTask(d,t.id); };
      acts.appendChild(edit); acts.appendChild(del);

      tdiv.appendChild(tick); tdiv.appendChild(meta); tdiv.appendChild(acts);
      tasksWrap.appendChild(tdiv);
    });

    dayCol.appendChild(tasksWrap);

    // add row with start & finish
    const add = document.createElement('div'); add.className='add';
    const textIn = document.createElement('input'); textIn.type='text'; textIn.placeholder='Task';
    const startIn = document.createElement('input'); startIn.type='time';
    const endIn = document.createElement('input'); endIn.type='time';
    const addBtn = document.createElement('button'); addBtn.className='btn primary'; addBtn.textContent='Add';
    addBtn.onclick = ()=>{
      const txt = textIn.value.trim();
      if(!txt) return showToast('Enter task text');
      addTask(d, txt, startIn.value || '', endIn.value || '');
      textIn.value=''; startIn.value=''; endIn.value='';
    };
    add.appendChild(textIn); add.appendChild(startIn); add.appendChild(endIn); add.appendChild(addBtn);
    dayCol.appendChild(add);

    plannerEl.appendChild(dayCol);
  }
  renderTomorrow();
  renderUpcoming();
  save();
}

/* CRUD */
function addTask(day, text, start, end){
  const t = { id: id(), text, start: start||'', end: end||'', completed:false, createdAt: nowMs(), lastNotified:0 };
  if(t.start) t.dueAt = computeNextDue(day, t.start);
  tasks[day].push(t);
  render();
}
function removeTask(day, tid){ tasks[day] = tasks[day].filter(x=>x.id!==tid); render(); }
function toggleComplete(day, tid){ const t = tasks[day].find(x=>x.id===tid); if(!t) return; t.completed = !t.completed; render(); }
function editTask(day, tid){
  const t = tasks[day].find(x=>x.id===tid); if(!t) return;
  const nt = prompt('Edit text:', t.text); if(nt===null) return;
  const ns = prompt('Start time (HH:MM) or blank:', t.start || ''); if(ns===null) return;
  const ne = prompt('End time (HH:MM) or blank:', t.end || ''); if(ne===null) return;
  t.text = nt.trim() || t.text; t.start = ns.trim(); t.end = ne.trim();
  t.dueAt = t.start ? computeNextDue(day, t.start) : undefined;
  t.lastNotified = 0;
  render();
}

/* Quick add (tomorrow) */
quickAdd.onclick = ()=> {
  const txt = quickText.value.trim(); if(!txt) return showToast('Enter quick task');
  const start = quickStart.value || ''; const end = quickEnd.value || '';
  const tomorrow = (new Date()).getDay() + 1; const day = tomorrow % 7;
  addTask(day, txt, start, end);
  quickText.value=''; quickStart.value=''; quickEnd.value='';
};

/* Tomorrow add */
tomAdd.onclick = ()=> {
  const txt = tomText.value.trim(); if(!txt) return showToast('Enter task');
  const start = tomStart.value || ''; const end = tomEnd.value || '';
  const tomorrow = (new Date()).getDay() + 1; const day = tomorrow % 7;
  addTask(day, txt, start, end);
  tomText.value=''; tomStart.value=''; tomEnd.value='';
};

/* Tomorrow list render */
function renderTomorrow(){
  tomListEl.innerHTML = '';
  const tomorrow = (new Date()).getDay() + 1; const day = tomorrow % 7;
  const arr = tasks[day] || [];
  if(arr.length === 0) tomListEl.innerHTML = '<div class="muted">No tasks for tomorrow</div>';
  else {
    arr.slice().sort((a,b)=> (a.start || '') > (b.start || '') ? 1 : -1).forEach(t=>{
      const el = document.createElement('div'); el.className='upItem';
      el.innerHTML = `<div style="max-width:180px">${escapeHtml(t.text)}</div><div class="muted">${t.start? t.start : '--:--'} → ${t.end? t.end : '--:--'}</div>`;
      tomListEl.appendChild(el);
    });
  }
}

/* Upcoming next 24h */
function renderUpcoming(){
  upcomingEl.innerHTML = '';
  const now = nowMs();
  const soon = [];
  for(let d=0; d<7; d++){
    (tasks[d]||[]).forEach(t=>{
      if(!t.start) return;
      const due = t.dueAt || computeNextDue(d, t.start);
      if(due > now && due - now <= 24*60*60*1000) soon.push({due,d,t});
    });
  }
  if(soon.length===0) upcomingEl.innerHTML = '<div class="muted">No reminders in next 24 hours</div>';
  else {
    soon.sort((a,b)=>a.due - b.due).slice(0,6).forEach(s=>{
      const el = document.createElement('div'); el.className='upItem';
      const dt = new Date(s.due);
      el.innerHTML = `<div>${DAYS[s.d].slice(0,3)} ${dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div><div style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.t.text)}</div>`;
      upcomingEl.appendChild(el);
    });
  }
}

/* compute next due ms for given weekday and HH:MM */
function computeNextDue(dayIndex, hhmm){
  if(!hhmm) return null;
  const [hh,mm] = hhmm.split(':').map(n=>Number(n));
  const now = new Date();
  const cand = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh||0, mm||0, 0, 0);
  const today = now.getDay();
  let delta = (dayIndex - today + 7) % 7;
  if(delta === 0 && cand.getTime() <= now.getTime()) delta = 7;
  cand.setDate(cand.getDate() + delta);
  return cand.getTime();
}

/* reminders: check periodically and on focus */
function checkDue(){
  const now = nowMs();
  let changed = false;
  for(let d=0; d<7; d++){
    (tasks[d]||[]).forEach(t=>{
      if(!t.start) return;
      if(!t.dueAt) t.dueAt = computeNextDue(d, t.start);
      if(t.dueAt && t.dueAt <= now && (!t.lastNotified || now - t.lastNotified > 30*1000)){
        // fire reminder (title = weekday + start)
        const title = `${DAYS[d]} ${t.start}`;
        const body = t.text;
        fireReminder(title, body);
        t.lastNotified = now;
        // schedule next week
        t.dueAt = t.dueAt + 7*24*60*60*1000;
        changed = true;
      }
    });
  }
  if(changed) { saveTasks(); render(); }
}

/* notification + in-page toast */
function fireReminder(title, body){
  showToast(`${title}: ${body}`, 8000);
  if(notifAllowed){
    try{ const n = new Notification(title, { body }); n.onclick = ()=> window.focus(); }catch(e){}
  }
}

/* save/load wrapper */
function saveTasks(){ try{ localStorage.setItem(STORAGE, JSON.stringify(tasks)); }catch(e){ showToast('Save failed'); } }
window.addEventListener('focus', ()=>{ checkDue(); renderUpcoming(); renderTomorrow(); });

/* quick notification permission */
notifBtn.addEventListener('click', async ()=>{
  if(!('Notification' in window)){ showToast('Notifications unsupported'); return; }
  if(Notification.permission === 'granted'){ notifAllowed = true; showToast('Notifications enabled'); return; }
  const p = await Notification.requestPermission();
  notifAllowed = (p === 'granted');
  showToast(notifAllowed ? 'Notifications enabled' : 'Notifications denied');
});

/* helper: save with debounce */
let saveTimer = null;
function saveDebounced(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ try{ localStorage.setItem(STORAGE, JSON.stringify(tasks)); }catch(e){ showToast('Save error'); } }, 300);
}

/* wrap save call */
function saveTasksAndRender(){ saveDebounced(); render(); }

/* CRUD wrappers that use saveDebounced */
function addTask(day, text, start, end){
  const t = { id: id(), text, start:start||'', end:end||'', completed:false, createdAt: nowMs(), lastNotified:0 };
  if(t.start) t.dueAt = computeNextDue(day, t.start);
  tasks[day].push(t); saveTasksAndRender();
}
function removeTask(day, tid){ tasks[day] = tasks[day].filter(x=>x.id !== tid); saveTasksAndRender(); }
function toggleComplete(day, tid){ const t = tasks[day].find(x=>x.id===tid); if(!t) return; t.completed = !t.completed; saveTasksAndRender(); }
function editTask(day, tid){
  const t = tasks[day].find(x=>x.id===tid); if(!t) return;
  const newText = prompt('Edit task text:', t.text); if(newText === null) return;
  const newStart = prompt('Start time (HH:MM) or blank:', t.start || ''); if(newStart === null) return;
  const newEnd = prompt('End time (HH:MM) or blank:', t.end || ''); if(newEnd === null) return;
  t.text = newText.trim() || t.text; t.start = newStart.trim(); t.end = newEnd.trim();
  t.dueAt = t.start ? computeNextDue(Number(prompt('Which weekday index? 0-Sun .. 6-Sat', '0')), t.start) : t.dueAt;
  t.lastNotified = 0;
  saveTasksAndRender();
}

/* remove old dueAt init */
(function initDueAt(){ let changed=false; for(let d=0; d<7; d++){ tasks[d].forEach(t=>{ if(t.start && !t.dueAt){ t.dueAt = computeNextDue(d, t.start); changed=true; } }); } if(changed) saveTasksAndRender(); })();

/* periodic check */
setInterval(checkDue, CHECK_INTERVAL);
checkDue();

/* initial render */
render();

/* expose save for console debug */
window._planner = { tasks, save: ()=>saveTasksAndRender() };

/* helper toast */
function showToast(msg, t=3000){ toastEl.textContent = msg; toastEl.style.display='block'; clearTimeout(toastEl._t); toastEl._t = setTimeout(()=> toastEl.style.display='none', t); }

/* small utility: id generator reused here */
function id(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

</script>