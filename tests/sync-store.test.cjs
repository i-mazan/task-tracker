const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../sync-store.js');
function setup(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}}
const board=(text='one')=>({tasks:[{id:'t1',text}],ideas:[]});
const row=(version,text='one',deleted=false)=>({kind:'tasks',id:'t1',payload:{id:'t1',text},position:0,version,deleted});
test('offline queue survives reload and is isolated by account',()=>{
 const storage=setup(),a=new Store(storage,'a');a.capture(board());
 assert.equal(new Store(storage,'a').state.queue.length,1);
 assert.equal(new Store(storage,'a').board().tasks[0].text,'one');
 assert.equal(new Store(storage,'b').board().tasks.length,0);
});
test('edits while request is in flight retain sequential versions',()=>{
 const a=new Store(setup(),'a');a.capture(board());const first=a.state.queue[0];
 a.capture(board('two'));assert.equal(a.state.queue[1].changes[0].base,1);
 a.acknowledge(first.id,[row(1)]);assert.equal(a.board().tasks[0].text,'two');
 a.acknowledge(a.state.queue[0].id,[row(2,'two')]);assert.equal(a.state.queue.length,0);
});
test('live updates cannot overwrite queued edits or newer versions',()=>{
 const a=new Store(setup(),'a');a.merge([row(1)]);a.capture(board('local'));
 a.merge([row(3,'remote')]);assert.equal(a.board().tasks[0].text,'local');
 a.merge([row(2,'stale')]);assert.equal(a.state.rows['["tasks","t1"]'].version,3);
});
test('server conflict choice removes dependent edits without losing other items',()=>{
 const a=new Store(setup(),'a');a.merge([row(1)]);a.capture(board('local'));a.capture({tasks:[{id:'t1',text:'later'},{id:'t2',text:'other'}],ideas:[]});
 a.resolve([{kind:'tasks',id:'t1',server:row(4,'remote')}],false);
 assert.equal(a.board().tasks.find(t=>t.id==='t1').text,'remote');
 assert.equal(a.state.queue[0].changes[0].id,'t2');
});
test('local conflict choice rebases all dependent edits',()=>{
 const a=new Store(setup(),'a');a.merge([row(1)]);a.capture(board('local'));a.capture(board('later'));
 a.resolve([{kind:'tasks',id:'t1',server:row(4,'remote')}],true);
 assert.deepEqual(a.state.queue.map(q=>q.changes[0].base),[4,5]);
});
test('deleted server item is restored under a new id',()=>{
 const a=new Store(setup(),'a');a.merge([row(1)]);a.capture(board('local'));a.capture(board('later'));
 a.resolve([{kind:'tasks',id:'t1',server:row(2,'one',true)}],true);
 assert.notEqual(a.board().tasks[0].id,'t1');
 assert.deepEqual(a.state.queue.map(q=>q.changes[0].base),[0,1]);
});
test('promotion is one batch containing task create and idea deletion',()=>{
 const a=new Store(setup(),'a');a.merge([{kind:'ideas',id:'i1',payload:{id:'i1',text:'idea'},position:0,version:1,deleted:false}]);
 a.capture(board());assert.equal(a.state.queue.length,1);assert.equal(a.state.queue[0].changes.length,2);
});
test('storage failure leaves the previous durable board intact',()=>{
 const storage=setup(),a=new Store(storage,'a');a.capture(board());storage.setItem=()=>{throw Error('full')};
 assert.throws(()=>a.capture(board('lost')));assert.equal(a.board().tasks[0].text,'one');
});
test('remote updates arriving while editing do not become accidental deletions or overwrites',()=>{
 const a=new Store(setup(),'a');a.merge([row(1)]);const rendered=a.visibleRows();
 a.merge([row(2,'remote'),{...row(1,'new'),id:'t2',payload:{id:'t2',text:'new'}}]);
 a.capture(board('local'),rendered);
 assert.equal(a.state.queue[0].changes.length,1);
 assert.equal(a.state.queue[0].changes[0].base,1);
 assert.equal(a.board().tasks.find(t=>t.id==='t2').text,'new');
});
test('receipt cleanup is durable and independent from pending edits',()=>{
 const storage=setup(),a=new Store(storage,'a');a.capture(board());const id=a.state.queue[0].id;
 a.acknowledge(id,[row(1)]);const reload=new Store(storage,'a');
 assert.equal(reload.state.queue.length,0);assert.deepEqual(reload.state.cleanup,[id]);
 reload.capture(board('two'));reload.cleanupComplete([id]);
 assert.equal(reload.state.queue.length,1);assert.equal(new Store(storage,'a').state.cleanup.length,0);
});
test('failed local acknowledgement cannot schedule unsafe server deletion',()=>{
 const storage=setup(),a=new Store(storage,'a');a.capture(board());const id=a.state.queue[0].id;
 storage.setItem=()=>{throw Error('full')};assert.throws(()=>a.acknowledge(id,[row(1)]));
 assert.equal(a.state.queue[0].id,id);assert.equal(a.state.cleanup.length,0);
});
test('failed local cleanup completion safely retries an already deleted receipt',()=>{
 const storage=setup(),a=new Store(storage,'a');a.capture(board());const id=a.state.queue[0].id;
 a.acknowledge(id,[row(1)]);storage.setItem=()=>{throw Error('full')};assert.throws(()=>a.cleanupComplete([id]));
 assert.deepEqual(a.state.cleanup,[id]);assert.equal(a.state.queue.length,0);
});
test('old caches upgrade without losing queued operations',()=>{
 const storage=setup();storage.setItem('taskflow.account.v1.a',JSON.stringify({rows:{},queue:[{id:'old',changes:[]}],migrated:true}));
 const a=new Store(storage,'a');assert.deepEqual(a.state.cleanup,[]);assert.equal(a.state.queue[0].id,'old');
});
