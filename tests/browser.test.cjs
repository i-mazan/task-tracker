// UI smoke test with a fake Supabase transport. Real RLS/Auth require a configured project.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const baseUrl=process.env.TASKFLOW_TEST_URL || 'http://127.0.0.1:8000/';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.TASKFLOW_CHROME || undefined,args:['--no-sandbox']});
 const context=await browser.newContext({serviceWorkers:'block'});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/supabase-config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.TASKFLOW_CONFIG={};'}));
 await page.goto(baseUrl);
 await page.getByText('Supabase is not configured yet.',{exact:false}).waitFor();
 assert.equal(await page.locator('#app').isVisible(),false);
 await context.route('**/supabase-config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.TASKFLOW_CONFIG={url:'https://test.supabase.co',publishableKey:'test'};"}));
 await context.route('**/vendor/supabase.js',route=>route.fulfill({contentType:'text/javascript',body:`
 window.supabase={createClient(){
 let authCallback;window.fakeRows=[];window.fakeRequests=[];window.fakeOnline=false;
 const session=()=>JSON.parse(localStorage.getItem('fakeSession')||'null');
 const query={select(){return this},eq(){return this},order(){return this},range(){return Promise.resolve({data:window.fakeRows,error:null})}};
 return {auth:{onAuthStateChange(callback){authCallback=callback},async getSession(){return {data:{session:session()}}},
 async signInWithPassword({email,password}){if(password==='bad')return {error:{message:'Invalid login credentials'}};
 const value={user:{id:'user-a',email}};localStorage.setItem('fakeSession',JSON.stringify(value));authCallback('SIGNED_IN',value);return {data:{session:value}}},
 async signOut(){localStorage.removeItem('fakeSession');authCallback('SIGNED_OUT',null);return {}},async updateUser(){return {}}},
 from(){return query},channel(){return {on(event,filter,callback){window.fakeLive=callback;return this},subscribe(callback){setTimeout(()=>callback('SUBSCRIBED'),10);return this}}},removeChannel(){},
 async rpc(name,args){if(name==='taskflow_acknowledge'){window.fakeCleanups=(window.fakeCleanups||[]).concat(args.operation_ids);return {error:null}};if(!window.fakeOnline)return {error:{message:'Network unavailable'}};window.fakeRequests.push(args);
 const rows=args.changes.map(change=>({...change,version:change.base+1,user_id:'user-a'}));window.fakeRows=rows;return {data:{ok:true,rows}}}}
 }};`}));
 await page.reload();await page.getByText('Sign in to your account.',{exact:true}).waitFor();
 assert.equal(await page.locator('#resetPassword').count(),0);
 await page.locator('#loginEmail').fill('test@example.com');await page.locator('#loginPassword').fill('bad');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByText('Invalid login credentials',{exact:true}).waitFor();
 await page.locator('#loginPassword').fill('correct');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#app').waitFor();
 await page.locator('#taskInput').fill('Offline task');await page.locator('#addBtn').click();await page.getByText('Offline task',{exact:true}).waitFor();
 await page.reload();await page.getByText('Offline task',{exact:true}).waitFor();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('taskflow.account.v1.user-a')));assert.equal(saved.queue.length,1);
 await page.evaluate(()=>{window.fakeOnline=true;window.dispatchEvent(new Event('online'))});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('taskflow.account.v1.user-a')).queue.length===0);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('taskflow.account.v1.user-a')).cleanup.length===0);
 assert.equal(await page.evaluate(()=>window.fakeCleanups.length),1);
 assert.equal(await page.evaluate(()=>window.fakeRequests.length),1);
 await page.evaluate(()=>window.fakeLive({new:{user_id:'user-a',kind:'tasks',id:'remote',payload:{id:'remote',text:'Remote task',category:'later'},position:2,version:1,deleted:false}}));
 await page.getByText('Remote task',{exact:true}).waitFor();
 await page.locator('#changePassword').click();await page.locator('#currentPassword').fill('correct');await page.locator('#newPassword').fill('newpassword');await page.locator('#confirmPassword').fill('different');await page.getByRole('button',{name:'Save password',exact:true}).click();await page.getByText('Passwords do not match.',{exact:true}).waitFor();await page.locator('#confirmPassword').fill('newpassword');await page.getByRole('button',{name:'Save password',exact:true}).click();
 assert.equal(await page.locator('#passwordDialog').isVisible(),false);
 // Reorder while offline and verify the durable order after a reload.
 await page.evaluate(()=>{window.fakeOnline=false});
 await page.locator('#taskInput').fill('Third task');await page.locator('#addBtn').click();
 async function moveBefore(source,target){
   await source.scrollIntoViewIfNeeded();const a=await source.boundingBox();
   await target.scrollIntoViewIfNeeded();const b=await target.boundingBox();
   await page.mouse.move(a.x+25,a.y+a.height/2);await page.mouse.down();
   await page.mouse.move(b.x+25,b.y+4,{steps:12});await page.mouse.up();
 }
 await moveBefore(page.locator('#laterTasks .task').filter({hasText:'Third task'}),page.locator('#laterTasks .task').filter({hasText:'Offline task'}));
 assert.deepEqual(await page.locator('#laterTasks .task-text').allTextContents(),['Third task','Offline task','Remote task']);
 await page.reload();await page.getByText('Third task',{exact:true}).waitFor();
 assert.deepEqual(await page.locator('#laterTasks .task-text').allTextContents(),['Third task','Offline task','Remote task']);
 await page.locator('[data-view="brain"]').click();await page.locator('#brainArea').fill('First idea\nSecond idea');await page.locator('#brainAddBtn').click();
 await moveBefore(page.locator('.idea').filter({hasText:'Second idea'}),page.locator('.idea').filter({hasText:'First idea'}));
 assert.deepEqual(await page.locator('.idea-text').allTextContents(),['Second idea','First idea']);
 await page.locator('[data-view="all"]').click();
 await page.evaluate(()=>{window.fakeOnline=true;window.dispatchEvent(new Event('online'))});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('taskflow.account.v1.user-a')).queue.length===0);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('taskflow.account.v1.user-a')).cleanup.length===0);
 await page.screenshot({path:'/tmp/taskflow-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/taskflow-mobile.png',fullPage:true});
 const second=await context.newPage();await second.goto(baseUrl);await second.getByText('TaskFlow is already open in another tab.',{exact:false}).waitFor();await second.close();
 await page.locator('#logout').click();await page.locator('#authScreen').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('taskflow.account.v1.user-a')),null);
 assert.deepEqual(errors,[]);console.log('PASS: configuration, login errors, offline reload, queue delivery, live updates, password validation, tab lock, offline task/idea reordering, logout');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
