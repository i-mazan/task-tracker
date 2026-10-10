
(async function(){
'use strict';
let tasks=[]; let ideas=[]; let currentView='all'; let selectedDeadline='later';
const $=id=>document.getElementById(id);
function pad(n){return String(n).padStart(2,'0')}
function dateKey(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function startDay(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function weekEnd(d){const x=startDay(d); const day=x.getDay(); const days=day===0?6:7-day; return addDays(x,days)}
function parseDate(s){if(!s)return null; const p=s.split('-').map(Number); if(p.length!==3||p.some(Number.isNaN))return null; return new Date(p[0],p[1]-1,p[2])}
function save(){persistBoard()}
function saveIdeas(){persistBoard()}
function dateBucketOf(t){
  if(!t.date)return 'later';
  const today=startDay(new Date()), due=parseDate(t.date); if(!due)return 'later';
  if(due.getTime()===today.getTime())return 'today';
  const end=weekEnd(today);
  if(due>today&&due<=end)return 'week';
  if(due<today){return due>=startDay(addDays(end,-6))?'week':'later'}
  return 'later';
}
function getBucket(t){
  if(t.completed)return 'completed'; if(t.bucketed)return 'bucket'; return t.category||'later';
}
function computeBuckets(){const b={today:[],week:[],later:[]};tasks.filter(t=>!t.completed&&!t.bucketed).forEach(t=>b[getBucket(t)].push(t));return b}
function isBucketOverdue(t){if(t.completed||t.bucketed||t.date||!t.assignedAt)return false;const today=startDay(new Date());if(t.category==='today')return startDay(new Date(t.assignedAt))<today;if(t.category==='week')return weekEnd(startDay(new Date(t.assignedAt)))<today;return false}
function dueLabel(t){if(!t.date)return isBucketOverdue(t)?'OVERDUE':'No deadline';const d=parseDate(t.date), today=startDay(new Date()); if(!d)return ''; const diff=Math.round((d-today)/86400000); if(diff<0)return 'Overdue · '+t.date; if(diff===0)return 'Due today'; return 'Due · '+t.date}
function completedLabel(t){if(!t.completedAt)return 'Completed'; return 'Completed · '+new Date(t.completedAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}
function attachDrag(el,getId,dropFn,groupSelector,excludeSelector,isBlocked){
 let pointerId=null,armed=false,startX=0,startY=0,holdTimer=null,currentTarget=null,ghost=null,offX=0,offY=0;
 const THRESHOLD=6;
 function clearHold(){if(holdTimer){clearTimeout(holdTimer);holdTimer=null}}
 function arm(){armed=true;el.setPointerCapture(pointerId);el.classList.add('dragging');const r=el.getBoundingClientRect();offX=startX-r.left;offY=startY-r.top;ghost=el.cloneNode(true);ghost.classList.add('drag-ghost');ghost.style.width=r.width+'px';ghost.style.left=(startX-offX)+'px';ghost.style.top=(startY-offY)+'px';document.body.appendChild(ghost)}
 function moveGhost(x,y){if(!ghost)return;ghost.style.left=(x-offX)+'px';ghost.style.top=(y-offY)+'px'}
 function updateTarget(x,y){const under=document.elementFromPoint(x,y);const grp=under&&under.closest?under.closest(groupSelector):null;if(grp!==currentTarget){if(currentTarget)currentTarget.classList.remove('drag-over');currentTarget=grp;if(currentTarget)currentTarget.classList.add('drag-over')}}
 function cleanup(){if(currentTarget)currentTarget.classList.remove('drag-over');if(ghost){ghost.remove();ghost=null}el.classList.remove('dragging');armed=false;currentTarget=null;clearHold()}
 el.addEventListener('pointerdown',e=>{
  if(isBlocked&&isBlocked())return;
  if(excludeSelector&&e.target.closest(excludeSelector))return;
  if(e.pointerType==='mouse'&&e.button!==0)return;
  pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;armed=false;
  if(e.pointerType==='touch')holdTimer=setTimeout(()=>{holdTimer=null;arm()},300)
 });
 el.addEventListener('pointermove',e=>{
  if(pointerId===null||e.pointerId!==pointerId)return;
  const dx=e.clientX-startX,dy=e.clientY-startY;
  if(!armed){
   if(e.pointerType!=='touch'&&Math.hypot(dx,dy)>THRESHOLD)arm();
   else if(holdTimer&&Math.hypot(dx,dy)>THRESHOLD)clearHold();
   if(!armed)return
  }
  e.preventDefault();moveGhost(e.clientX,e.clientY);updateTarget(e.clientX,e.clientY)
 });
 function finish(e){
  if(pointerId===null||e.pointerId!==pointerId)return;
  const wasArmed=armed,target=currentTarget,id=getId();
  cleanup();pointerId=null;
  if(wasArmed&&target)dropFn(id,target.dataset.bucket)
 }
 el.addEventListener('pointerup',finish);
 el.addEventListener('pointercancel',finish);
}
function attachDoubleTapEdit(el,text,excludeSelector,startEdit){
 let tapStartX=0,tapStartY=0,lastTapTime=0,lastTapX=0,lastTapY=0;
 el.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;tapStartX=e.clientX;tapStartY=e.clientY});
 el.addEventListener('pointerup',e=>{
  if(e.pointerType!=='touch'||text.isContentEditable)return;
  if(excludeSelector&&e.target.closest(excludeSelector))return;
  if(Math.hypot(e.clientX-tapStartX,e.clientY-tapStartY)>10)return;
  const now=Date.now();
  if(now-lastTapTime<350&&Math.hypot(e.clientX-lastTapX,e.clientY-lastTapY)<30){lastTapTime=0;startEdit()}
  else{lastTapTime=now;lastTapX=e.clientX;lastTapY=e.clientY}
 });
}
function makeTask(t,mode){
 const draggable=mode==='board'||mode==='bucket';
 const el=document.createElement('article'); el.className='task'; el.dataset.id=t.id;
 const main=document.createElement('div');main.className='task-main';const text=document.createElement('div');text.className='task-text';text.textContent=t.text;
 function startEditing(){text.contentEditable='true';text.classList.add('editing');text.focus();const range=document.createRange();range.selectNodeContents(text);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range)}
 el.addEventListener('dblclick',e=>{if(e.target.closest('.task-actions')||e.target.closest('.task-date-btn'))return;e.stopPropagation();startEditing()});
 attachDoubleTapEdit(el,text,'.task-actions,.task-date-btn',startEditing);
 text.addEventListener('keydown',e=>{if(!text.isContentEditable)return;if(e.key==='Enter'){e.preventDefault();text.blur()}else if(e.key==='Escape'){e.preventDefault();text.textContent=t.text;text.blur()}});
 text.addEventListener('blur',()=>{if(text.contentEditable!=='true')return;text.contentEditable='false';text.classList.remove('editing');const newText=text.textContent.trim();if(newText&&newText!==t.text){t.text=newText;save();render()}else{text.textContent=t.text}});
 const metaRow=document.createElement('div');metaRow.className='meta-row';
 const meta=document.createElement('div');meta.className='task-meta';const metaLabel=mode==='board'?dueLabel(t):mode==='completed'?completedLabel(t):'In Bucket';meta.textContent=metaLabel;if(mode==='board'&&(metaLabel==='OVERDUE'||metaLabel.indexOf('Overdue')===0))meta.classList.add('meta-overdue');
 metaRow.appendChild(meta);
 if(mode==='board'){const dateBtn=document.createElement('button');dateBtn.type='button';dateBtn.className='task-date-btn';dateBtn.textContent='📅';dateBtn.title='Set a specific deadline date';dateBtn.setAttribute('aria-label','Set deadline date');dateBtn.addEventListener('click',ev=>{ev.stopPropagation();const input=document.createElement('input');input.type='date';input.className='date-input';input.value=t.date||'';metaRow.replaceWith(input);input.focus();if(input.showPicker){try{input.showPicker()}catch(err){}}const commit=()=>{t.date=input.value||null;save();render()};input.addEventListener('change',commit);input.addEventListener('blur',commit)});metaRow.appendChild(dateBtn)}
 main.append(text,metaRow);
 const actions=document.createElement('div');actions.className='task-actions';
 if(mode==='board'){const c=document.createElement('button');c.className='task-action complete';c.textContent='✓';c.title='Complete';c.setAttribute('aria-label','Complete task');c.onclick=()=>{t.completed=true;t.completedAt=Date.now();save();render();toast('Task completed')};const x=document.createElement('button');x.className='task-action cancel';x.textContent='×';x.title='Move to Bucket';x.setAttribute('aria-label','Move to Bucket');x.onclick=()=>{t.bucketed=true;t.completed=false;t.completedAt=null;save();render();toast('Moved to Bucket')};actions.append(c,x)}
 else {const r=document.createElement('button');r.className='restore';r.textContent='Restore';r.onclick=()=>{t.completed=false;t.bucketed=false;t.completedAt=null;t.assignedAt=Date.now();save();render();toast('Task restored')};const d=document.createElement('button');d.className='delete';d.textContent='Delete';d.onclick=()=>{tasks=tasks.filter(x=>x.id!==t.id);save();render()};actions.append(r,d)}
 el.append(main,actions);
 if(draggable)attachDrag(el,()=>t.id,(id,bucket)=>dropTo(bucket,id),'.group','.task-actions,.task-date-btn',()=>text.isContentEditable);
 return el;
}
function renderGroup(id,arr,countId,mode,emptyText){const box=$(id);box.innerHTML='';$(countId).textContent=arr.length;if(!arr.length){const e=document.createElement('div');e.className='empty';e.textContent=emptyText||'Nothing here yet';box.appendChild(e)}else arr.forEach(t=>box.appendChild(makeTask(t,mode)))}
function updateCounts(b){$('allCount').textContent=tasks.filter(t=>!t.completed&&!t.bucketed).length;$('todayCountSide').textContent=b.today.length;$('weekCountSide').textContent=b.week.length;$('laterCountSide').textContent=b.later.length;$('completedCount').textContent=tasks.filter(t=>t.completed).length;$('bucketCount').textContent=tasks.filter(t=>t.bucketed&&!t.completed).length}
function renderSecondary(){const list=tasks.filter(t=>t.completed);$('secondaryTitle').textContent='Completed';$('secondaryItems').innerHTML='';if(!list.length){const e=document.createElement('div');e.className='empty';e.textContent='No completed tasks yet';$('secondaryItems').appendChild(e)}else list.forEach(t=>$('secondaryItems').appendChild(makeTask(t,'completed')))}
function renderBucketBoard(){const list=tasks.filter(t=>t.bucketed&&!t.completed);const b={today:[],week:[],later:[]};list.forEach(t=>b[t.category||'later'].push(t));renderGroup('bucketTodayTasks',b.today,'bucketTodayCount','bucket');renderGroup('bucketWeekTasks',b.week,'bucketWeekCount','bucket');renderGroup('bucketLaterTasks',b.later,'bucketLaterCount','bucket')}
function renderSummaryList(listId,countId,arr){const box=$(listId);box.innerHTML='';$(countId).textContent=arr.length;if(!arr.length){const e=document.createElement('div');e.className='summary-empty';e.textContent='Nothing here';box.appendChild(e)}else arr.forEach(t=>{const row=document.createElement('div');row.className='summary-item';row.textContent=t.text;box.appendChild(row)})}
function renderBrainSummary(){const b=computeBuckets();renderSummaryList('summaryToday','summaryTodayCount',b.today);renderSummaryList('summaryWeek','summaryWeekCount',b.week);renderSummaryList('summaryLater','summaryLaterCount',b.later)}
function renderBrainIdeas(){const box=$('brainIdeas');box.innerHTML='';if(!ideas.length){const e=document.createElement('div');e.className='empty';e.textContent='Nothing captured yet';box.appendChild(e);return}ideas.forEach(idea=>{const el=document.createElement('article');el.className='idea';el.dataset.id=idea.id;const text=document.createElement('div');text.className='idea-text';text.textContent=idea.text;const clear=document.createElement('button');clear.className='delete idea-clear';clear.textContent='×';clear.title='Clear';clear.setAttribute('aria-label','Clear idea');clear.onclick=()=>{ideas=ideas.filter(x=>x.id!==idea.id);saveIdeas();renderBrainIdeas()};el.append(text,clear);attachDrag(el,()=>idea.id,(id,bucket)=>promoteIdea(id,bucket),'.summary-col','.idea-clear');box.appendChild(el)})}
function promoteIdea(ideaId,category){const idea=ideas.find(i=>i.id===ideaId);if(!idea)return;tasks.push({id:Date.now()+'-'+Math.random().toString(36).slice(2),text:idea.text,date:null,category,completed:false,bucketed:false,completedAt:null,assignedAt:Date.now()});ideas=ideas.filter(i=>i.id!==ideaId);save();saveIdeas();render();toast('Idea moved to '+(category==='today'?'Today':category==='week'?'This week':'Later'))}
function renderBrain(){renderBrainSummary();renderBrainIdeas()}
function addIdeas(){const area=$('brainArea');const lines=area.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return;lines.forEach(text=>ideas.push({id:Date.now()+'-'+Math.random().toString(36).slice(2),text}));saveIdeas();area.value='';renderBrainIdeas();toast(lines.length+' idea'+(lines.length===1?'':'s')+' added')}
function showView(view){currentView=view;document.querySelectorAll('.nav-btn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));const single={today:'todayGroup',week:'weekGroup',later:'laterGroup'};const isBoard=view==='all'||!!single[view];const isBucket=view==='bucket';const isCompleted=view==='completed';const isBrain=view==='brain';$('addCard').hidden=view!=='all';$('board').hidden=!isBoard;$('bucketBoard').hidden=!isBucket;$('bucketActions').hidden=!isBucket;$('secondary').hidden=!isCompleted;$('brainView').hidden=!isBrain;if(isBoard){['todayGroup','weekGroup','laterGroup'].forEach(id=>$(id).classList.toggle('hidden',view!=='all'&&id!==single[view]));$('pageTitle').textContent=view==='all'?'🌸 All tasks':view==='today'?'Today':view==='week'?'This week':'Later';$('eyebrow').textContent=view==='all'?'Overview':'Tasks';$('pageSubtitle').textContent=view==='all'?'Capture tasks, then move them between Today, This week and Later.':'Tasks in this view.'}else if(isBucket){$('pageTitle').textContent='Bucket';$('eyebrow').textContent='Lists';$('pageSubtitle').textContent='Tasks you decided not to keep active. Drag into a column or use Restore to bring one back.';renderBucketBoard()}else if(isBrain){$('pageTitle').textContent='Brain dump';$('eyebrow').textContent='Capture';$('pageSubtitle').textContent='Dump every idea — nothing is removed until you clear it.';renderBrain()}else{$('pageTitle').textContent='Completed';$('eyebrow').textContent='Lists';$('pageSubtitle').textContent='Everything you have completed.';renderSecondary()} }
function render(){const b=computeBuckets();renderGroup('todayTasks',b.today,'todayCount','board','A clear day ahead.');renderGroup('weekTasks',b.week,'weekCount','board','Plenty of room this week.');renderGroup('laterTasks',b.later,'laterCount','board','Nothing waiting in the wings yet.');updateCounts(b);showView(currentView)}
function addTask(){const input=$('taskInput');const text=input.value.trim();if(!text)return;tasks.push({id:Date.now()+'-'+Math.random().toString(36).slice(2),text,date:null,category:selectedDeadline,completed:false,bucketed:false,completedAt:null,assignedAt:Date.now()});save();input.value='';render();toast('Task added')}
function setDeadlineButtons(){document.querySelectorAll('.quick-btn').forEach(b=>b.classList.toggle('selected',b.dataset.deadline===selectedDeadline))}
function dropTo(group,id){const t=tasks.find(x=>x.id===id);if(!t)return;t.completed=false;t.bucketed=false;t.completedAt=null;t.category=group;t.assignedAt=Date.now();save();render();toast('Task moved')}
function clearAllCompleted(){const count=tasks.filter(t=>t.completed).length;if(!count)return;if(!confirm('Clear all '+count+' completed task'+(count===1?'':'s')+'? This cannot be undone.'))return;tasks=tasks.filter(t=>!t.completed);save();render();toast('Completed cleared')}
function clearAllIdeas(){const count=ideas.length;if(!count)return;if(!confirm('Clear all '+count+' idea'+(count===1?'':'s')+' in Brain dump? This cannot be undone.'))return;ideas=[];saveIdeas();renderBrainIdeas();toast('Brain dump cleared')}
function deleteAllBucketed(){const count=tasks.filter(t=>t.bucketed&&!t.completed).length;if(!count)return;if(!confirm('Delete all '+count+' task'+(count===1?'':'s')+' in Bucket? This cannot be undone.'))return;tasks=tasks.filter(t=>!(t.bucketed&&!t.completed));save();render();toast('Bucket cleared')}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),1500)}
let client, store, account, channel, syncing=false, syncTimer, realtimeReady=false;
let editTimer, currentConflicts=[], renderedRows={};
function status(message) { $('syncStatus').textContent=message; }
function showBoard() {
 // Avoid replacing a contenteditable node while the user is typing.
 if (document.querySelector('[contenteditable="true"]') || document.querySelector('.date-input')) {
   clearTimeout(editTimer); editTimer=setTimeout(showBoard,500); return;
 }
 renderedRows=store.visibleRows();
 const board=store.board(); tasks=board.tasks; ideas=board.ideas; render();
}
function persistBoard() {
 if (!store || !account) return;
 try {
   const changes=store.capture({tasks,ideas},renderedRows);
   for(const change of changes || []) renderedRows[JSON.stringify([change.kind,change.id])]={...change,version:change.base+1};
 }
 catch (error) { showBoard(); toast('Local storage is full or unavailable. Change was not saved.'); return; }
 status(navigator.onLine ? 'Changes pending…' : 'Offline · '+store.state.queue.length+' batches pending');
 clearTimeout(syncTimer); syncTimer=setTimeout(synchronize,100);
}
function connectionStatus() {
 status(!navigator.onLine ? 'Offline · '+store.state.queue.length+' batches pending' : store.state.queue.length ? store.state.queue.length+' batches pending' : realtimeReady ? 'Synced · Live updates connected' : 'Synced · Connecting live updates…');
}
async function fetchRows(owner) {
 const rows=[];
 for(let offset=0;;offset+=1000) {
   const result=await client.from('taskflow_items').select('*').eq('user_id',owner).order('kind').order('id').range(offset,offset+999);
   if(result.error) throw result.error;
   rows.push(...result.data);
   if(result.data.length<1000) return rows;
 }
}
async function synchronize() {
 if(syncing || !account || !store || !navigator.onLine || $('conflictDialog').open) { if(store) connectionStatus(); return; }
 syncing=true;
 const owner=account.id, active=store;
 status('Syncing…');
 try {
   while(active.state.queue.length && account?.id===owner) {
     const batch=active.state.queue[0];
     const {data,error}=await client.rpc('taskflow_apply',{operation_id:batch.id,changes:batch.changes});
     if(error) throw error;
     if(account?.id!==owner || active!==store) return;
     if(!data.ok) {
       currentConflicts=data.conflicts;
       $('conflictDetails').textContent=data.conflicts.map(conflict=>{
         const local=batch.changes.find(change=>change.kind===conflict.kind && change.id===conflict.id);
         return 'Your version: '+(local?.deleted?'Deleted':local?.payload.text || '')+'\nServer version: '+(conflict.server?.deleted?'Deleted':conflict.server?.payload.text || 'Missing');
       }).join('\n\n');
       $('conflictDialog').showModal(); status('Choose how to resolve conflicting changes'); return;
     }
     active.acknowledge(batch.id,data.rows);
   }
   const rows=await fetchRows(owner);
   if(account?.id!==owner || active!==store) return;
   active.merge(rows); showBoard(); connectionStatus();
   // Cleanup never blocks task delivery. Retain IDs until both server deletion
   // and the local removal of the cleanup request have succeeded.
   try {
     while(active.state.cleanup.length && account?.id===owner && active===store) {
       const ids=active.state.cleanup.slice(0,1000);
       const {error}=await client.rpc('taskflow_acknowledge',{operation_ids:ids});
       if(error) throw error;
       if(account?.id!==owner || active!==store) return;
       active.cleanupComplete(ids);
     }
   } catch(error) { if(account?.id===owner) status('Tasks synced · Receipt cleanup will retry: '+error.message); }
 } catch(error) {
   if(account?.id===owner) status('Sync paused: '+error.message+' · Changes kept on this device');
 } finally { syncing=false; }
}
async function activate(session) {
 const next=session?.user || null;
 if((next && account && next.id===account.id) || (!next && account===null)) return;
 account=next; store=null; realtimeReady=false;
 clearTimeout(editTimer); clearTimeout(syncTimer);
 if(channel) { client.removeChannel(channel); channel=null; }
 $('conflictDialog').close(); $('passwordDialog').close();
 tasks=[]; ideas=[]; render(); $('taskInput').value=''; $('brainArea').value='';
 $('app').hidden=!next; $('authScreen').hidden=!!next;
 if(!next) { $('authStatus').textContent='Sign in to your account.'; return; }
 try { store=new TaskflowSyncStore(localStorage,next.id); }
 catch(error) { $('app').hidden=true; $('authScreen').hidden=false; $('authStatus').textContent='Cannot open local storage: '+error.message; return; }
 $('accountEmail').textContent=next.email;
 showBoard(); connectionStatus();
 channel=client.channel('taskflow-'+next.id).on('postgres_changes',{
   event:'*',schema:'public',table:'taskflow_items',filter:'user_id=eq.'+next.id
 },event=>{
   if(account?.id!==next.id || !store || !event.new?.id) return;
   try { store.merge([event.new]); showBoard(); } catch(error) { status('Could not cache live update: '+error.message); }
 }).subscribe(state=>{
   if(account?.id!==next.id) return;
   realtimeReady=state==='SUBSCRIBED';
   if(realtimeReady) synchronize(); else connectionStatus();
 });
 synchronize();
}
function openPassword() {
 $('passwordForm').reset(); $('passwordStatus').textContent='';
 if(!$('passwordDialog').open) $('passwordDialog').showModal();
}
async function startCloud() {
 if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
 const config=window.TASKFLOW_CONFIG;
 if(!config?.url || !config?.publishableKey) { $('authStatus').textContent='Supabase is not configured yet. See SUPABASE_SETUP.md.'; return; }
 if(!window.supabase) { $('authStatus').textContent='Supabase client could not load. Reload while online.'; return; }
 // Only one active tab per browser can write this durable queue. Other devices are independent.
 if(!navigator.locks) { $('authStatus').textContent='This browser needs Web Locks support. Please use a current browser.'; return; }
 const locked=await new Promise(resolve=>navigator.locks.request('taskflow-active-tab',{ifAvailable:true},lock=>{
   resolve(!!lock); return lock ? new Promise(()=>{}) : undefined;
 }));
 if(!locked) { $('authStatus').textContent='TaskFlow is already open in another tab. Close that tab and reload here.'; return; }
 client=window.supabase.createClient(config.url,config.publishableKey);
 client.auth.onAuthStateChange((event,session)=>{
   // Supabase auth callbacks must return before making another auth/API call.
   setTimeout(async()=>{
     try { await activate(session); }
     catch(error) { $('authStatus').textContent=error.message; }
   },0);
 });
 const {data,error}=await client.auth.getSession();
 if(error) $('authStatus').textContent=error.message; else await activate(data.session);
 setInterval(synchronize,30000);
}
$('loginForm').addEventListener('submit',async event=>{
 event.preventDefault(); if(!client) return;
 const button=event.submitter; button.disabled=true; $('authStatus').textContent='Signing in…';
 try {
   const {data,error}=await client.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
   if(error) throw error; $('loginPassword').value=''; await activate(data.session);
 } catch(error) { $('authStatus').textContent=error.message; } finally { button.disabled=false; }
});
$('changePassword').onclick=()=>openPassword();
$('cancelPassword').onclick=()=>$('passwordDialog').close();
$('passwordForm').addEventListener('submit',async event=>{
 event.preventDefault(); if(!client) return;
 if($('newPassword').value!==$('confirmPassword').value) { $('passwordStatus').textContent='Passwords do not match.'; return; }
 event.submitter.disabled=true;
 try {
   const attributes={password:$('newPassword').value,current_password:$('currentPassword').value};
   const {error}=await client.auth.updateUser(attributes);
   if(error) throw error;
   $('passwordForm').reset(); $('passwordDialog').close(); toast('Password updated');
 } catch(error) { $('passwordStatus').textContent=error.message; } finally { event.submitter.disabled=false; }
});
$('logout').onclick=async()=>{
 if(!account || syncing) { toast('Wait for synchronization to finish'); return; }
 const active=store;
 if(active.state.queue.length && !confirm('Unsynced changes will stay on this device until you sign in to this account again. Sign out?')) return;
 const {error}=await client.auth.signOut({scope:'local'});
 if(error) { status('Sign out failed: '+error.message); return; }
 if(!active.state.queue.length) {
   if(active.state.cleanup.length) { active.state.rows={}; active.persist(); }
   else localStorage.removeItem(active.storageKey);
 }
 await activate(null);
};
$('syncNow').onclick=synchronize;
for(const [id,keep] of [['keepLocal',true],['keepServer',false]]) $(id).onclick=()=>{
 try { store.resolve(currentConflicts,keep); $('conflictDialog').close(); showBoard(); synchronize(); }
 catch(error) { status('Could not save conflict resolution: '+error.message); }
};
window.addEventListener('online',synchronize);
window.addEventListener('offline',()=>{if(store) connectionStatus();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden) synchronize();});

$('sidebarNav').addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(b){e.preventDefault();showView(b.dataset.view)}});
$('addBtn').addEventListener('click',addTask);$('taskInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addTask()}});
document.querySelectorAll('.quick-btn').forEach(b=>b.addEventListener('click',()=>{selectedDeadline=b.dataset.deadline;setDeadlineButtons()}));
$('brainAddBtn').addEventListener('click',addIdeas);
$('brainArea').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();addIdeas()}});
$('deleteAllBucketBtn').addEventListener('click',deleteAllBucketed);
$('clearAllIdeasBtn').addEventListener('click',clearAllIdeas);
$('clearAllCompletedBtn').addEventListener('click',clearAllCompleted);
await startCloud();
})();
