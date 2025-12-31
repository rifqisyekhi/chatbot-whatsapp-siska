const fs = require('fs');
const s = fs.readFileSync('index.js', 'utf8');
const lines = s.split(/\r?\n/);
let balance = 0;
let inSingle=false,inDouble=false,inBack=false,escape=false;
for(let li=0;li<lines.length;li++){
  const line=lines[li];
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(escape){escape=false; continue}
    if(c==='\\'){escape=true; continue}
    if(inSingle){ if(c==="'") inSingle=false; continue}
    if(inDouble){ if(c=='"') inDouble=false; continue}
    if(inBack){ if(c==='`') inBack=false; continue}
    if(c==="'") { inSingle=true; continue }
    if(c=='"'){ inDouble=true; continue }
    if(c==='`'){ inBack=true; continue }
    if(c==='{') balance++;
    if(c==='}') balance--;
  }
  if(li>=1700 && li<=1815) console.log('line',li+1,'balance',balance,'text',line);
  if(balance<0) { console.log('Negative balance at line',li+1); console.log(lines[li-6]||'---'); console.log(lines[li-5]||'---'); console.log(lines[li-4]||'---'); console.log(lines[li-3]||'---'); console.log(lines[li-2]||'---'); console.log(lines[li-1]||'---'); console.log(lines[li]); console.log(lines[li+1]||'---'); console.log(lines[li+2]||'---'); process.exit(0) }
}
if(balance!==0) console.log('Final balance',balance); else console.log('Balanced');
