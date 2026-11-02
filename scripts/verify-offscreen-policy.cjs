const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createFacade } = require('../tools/native-automation/policy.cjs');
let hostEffects=0;
let captureOptions;
class FakeWindow extends EventEmitter {
  constructor(options){super();this.options=options;this.id=1;this.webContents=new EventEmitter();this.webContents.setWindowOpenHandler=()=>{};this.webContents.setFrameRate=()=>{};this.webContents.capturePage=async(rect,options)=>{captureOptions=options;return 'native-frame'};}
  show(){hostEffects++} showInactive(){hostEffects++} focus(){hostEffects++} restore(){hostEffects++} maximize(){hostEffects++} setFullScreen(){hostEffects++}
}
const original={BrowserWindow:FakeWindow,app:{focus(){hostEffects++},relaunch(){hostEffects++}},shell:{openExternal(){hostEffects++}},clipboard:{writeText(){hostEffects++}},dialog:{showMessageBox(){hostEffects++}}};
const events=[];
const safe=createFacade(original,(type,details)=>events.push({type,details}));
const w=new safe.BrowserWindow({show:true,focusable:true,webPreferences:{offscreen:false,backgroundThrottling:true}});
// Electron 36 filters its native window registry by constructor.name.
assert.equal(w.constructor,FakeWindow,'Do not subclass/rename native BrowserWindow instances');
assert.equal(w.options.show,false);assert.equal(w.options.focusable,false);assert.equal(w.options.skipTaskbar,true);
assert.equal(w.options.webPreferences.offscreen,true);assert.equal(w.options.webPreferences.backgroundThrottling,false);
w.show();w.showInactive();w.focus();w.restore();w.maximize();w.setFullScreen(true);safe.app.focus();safe.app.relaunch();safe.clipboard.writeText('task-owned data');
assert.equal(hostEffects,0);
assert.throws(()=>safe.dialog.showMessageBox({title:'manual confirmation'}),/MANUAL_ACTION_REQUIRED/);
(async()=>{assert.equal(await w.capturePage({x:0,y:0,width:20,height:20}),'native-frame');assert.equal(captureOptions.stayHidden,true);assert.equal(captureOptions.stayAwake,true);assert.equal(hostEffects,0);console.log(JSON.stringify({status:'PASS',hostEffects:0,hiddenAndOffscreen:true,manualDialogsNeverAccepted:true,blockedCalls:events.length}));})().catch(e=>{console.error(e.message);process.exitCode=1});
