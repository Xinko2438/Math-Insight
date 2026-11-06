const fs=require('fs'),path=require('path'),crypto=require('crypto');
const here=__dirname;
const h=f=>({sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),bytes:fs.statSync(f).size});
const files={};['index.html','app.js','data.js','styles.css','r3-fixtures.js','gallery.html','r7-notes.md','_r7hash.js','screenshots/r7-screenshots-manifest.json'].forEach(f=>{const p=path.join(here,f);if(fs.existsSync(p))files[f]=h(p)});
const frozen='D:\\AI_Tools\\OpenMausBot\\data\\task-workspaces\\154430b7-4741-4857-9000-a1fb494a5a9f\\76f6df31-cf5f-4edc-bd2c-978d6d74e839\\green-review-20261105\\r6\\ui';
const base={};['index.html','app.js','data.js','styles.css'].forEach(f=>base[f]=h(path.join(frozen,f)));
fs.writeFileSync(path.join(here,'r7-hashes.json'),JSON.stringify({schema:'green-ui-r7-material.v1',version:'GREEN-R1-UI-R7-20261106',inputVersion:'GREEN-R1-20261104-1504',gitObject:'0c1c043ee630dcbdf624b788272d52f2bde0f818',generatedAt:new Date().toISOString(),generator:'_r7hash.js (writes material)',sourceR6:base,files,measurement:{r6_390_screen:[713,2300],r7_390_screen:[713,713],r6_375_screen:[536,2294],r7_375_screen:[536,670]},note:'r7-hashes.json cannot include its own hash; recompute externally.'},null,2));
console.log('written');
