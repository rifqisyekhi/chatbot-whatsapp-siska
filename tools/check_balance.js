const fs = require('fs');
const s = fs.readFileSync('index.js', 'utf8');
let stack = [];
let inSingle = false, inDouble = false, inBack = false, escape = false;
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (escape) { escape = false; continue; }
  if (c === '\\') { escape = true; continue; }
  if (inSingle) { if (c === "'") { inSingle = false; } continue; }
  if (inDouble) { if (c === '"') { inDouble = false; } continue; }
  if (inBack) { if (c === '`') { inBack = false; } continue; }
  if (c === "'") { inSingle = true; continue; }
  if (c === '"') { inDouble = true; continue; }
  if (c === '`') { inBack = true; continue; }
  if (c === '(' || c === '{' || c === '[') stack.push({c, i, line: s.slice(0,i).split(/\r?\n/).length});
  if (c === ')') { const t = stack.pop(); if (!t || t.c !== '(') { console.log('mismatch ) at', i, 'line', s.slice(0,i).split(/\r?\n/).length); console.log('stack top',stack[stack.length-1]); process.exit(0); } }
  if (c === '}') { const t = stack.pop(); if (!t || t.c !== '{') { console.log('mismatch } at', i, 'line', s.slice(0,i).split(/\r?\n/).length); console.log('stack top',stack[stack.length-1]); process.exit(0); } }
  if (c === ']') { const t = stack.pop(); if (!t || t.c !== '[') { console.log('mismatch ] at', i, 'line', s.slice(0,i).split(/\r?\n/).length); console.log('stack top',stack[stack.length-1]); process.exit(0); } }
}
if (inSingle || inDouble || inBack) {
  console.log('Unclosed string/backtick');
  process.exit(0);
}
if (stack.length) {
  console.log('Unclosed braces stack top', stack[stack.length-1]);
  process.exit(0);
}
console.log('All balanced');
