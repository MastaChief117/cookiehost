const ALLOWED = new Set(['html','htm','css','js','json','txt','svg']);
const CHUNK_SIZE = 3000;
const PREFIX = 'cookiehost_';
const filesInput = document.querySelector('#site-files');
const dropZone = document.querySelector('#drop-zone');
const fileList = document.querySelector('#file-list');
const bakeButton = document.querySelector('#bake-button');
const statusBox = document.querySelector('#status');
const resultBox = document.querySelector('#result');
let selectedFiles = [];

const extension = name => (name.split('.').pop() || '').toLowerCase();
const prettyBytes = n => { if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(1)} MB`; };
const setStatus = (title, detail, kind='') => { statusBox.className = `status ${kind}`; statusBox.querySelector('.status-title').textContent = title; statusBox.querySelector('.status-detail').textContent = detail; };

function renderFiles() {
  if (!selectedFiles.length) { fileList.className='file-list empty'; fileList.textContent='No files selected yet.'; bakeButton.disabled=true; return; }
  fileList.className='file-list';
  fileList.innerHTML = selectedFiles.map(file => `<div class="file-row ${ALLOWED.has(extension(file.name))?'':'unsupported'}"><span>${escapeHtml(file.relativePath || file.name)}</span><span>${ALLOWED.has(extension(file.name)) ? prettyBytes(file.size) : 'UNSUPPORTED'}</span></div>`).join('');
  bakeButton.disabled = false;
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
filesInput.addEventListener('change', () => { selectedFiles = [...filesInput.files].map(file => Object.assign(file, {relativePath: file.webkitRelativePath || file.name})); renderFiles(); });
['dragover','dragenter'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.add('dragging'); }));
['dragleave','drop'].forEach(type => dropZone.addEventListener(type, e => { e.preventDefault(); dropZone.classList.remove('dragging'); }));
dropZone.addEventListener('drop', e => { selectedFiles = [...e.dataTransfer.files].map(file => Object.assign(file,{relativePath:file.webkitRelativePath||file.name})); renderFiles(); });

function clearCookies() { document.cookie.split(';').forEach(raw => { const name=raw.split('=')[0].trim(); if (name === 'cookiehost_count' || name.startsWith(PREFIX)) document.cookie=`${name}=; Max-Age=0; Path=/; SameSite=Lax`; }); }
function readCookie(name) { const row=document.cookie.split('; ').find(x=>x.startsWith(`${name}=`)); return row ? decodeURIComponent(row.slice(name.length+1)) : null; }
function getCookies() { return Object.fromEntries(document.cookie.split('; ').filter(Boolean).map(x => { const i = x.indexOf('='); return [x.slice(0, i), decodeURIComponent(x.slice(i+1))]; })); }
function cookiesEnabled() { const test = 'test_cookie_' + Date.now(); document.cookie = `${test}=1; Path=/; SameSite=Lax`; const exists = document.cookie.includes(test); if (exists) document.cookie = `${test}=; Max-Age=0; Path=/`; return exists; }
async function gzip(bytes) { if (!('CompressionStream' in window)) throw new Error('This browser does not support native gzip compression.'); const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')); return new Uint8Array(await new Response(stream).arrayBuffer()); }
function toBase64(bytes) { let binary=''; const size=0x8000; for(let i=0;i<bytes.length;i+=size) binary+=String.fromCharCode(...bytes.subarray(i,i+size)); return btoa(binary); }

bakeButton.addEventListener('click', async () => {
  resultBox.hidden=true;
  const bad=selectedFiles.filter(f => !ALLOWED.has(extension(f.name)));
  if (bad.length) { setStatus('Unsupported files found.', `${bad.length} file(s) are not website text files. Remove them, then bake again.`, 'error'); return; }
  try {
    setStatus('Step 1 of 8 · Checking browser support…','Verifying this browser can store cookies and compress data.');
    if (!cookiesEnabled()) throw new Error('COOKIES_DISABLED');
    if (!('CompressionStream' in window)) throw new Error('GZIP_UNSUPPORTED');
    
    setStatus('Step 2 of 8 · Reading files…','Reading selected files locally with the browser File API.');
    const packageFiles=[]; let original=0;
    for (const file of selectedFiles) { const content=await file.text(); original+=new TextEncoder().encode(content).length; packageFiles.push({path:(file.relativePath||file.name).replace(/^.*?\//,''),content}); }
    
    setStatus('Step 3 of 8 · Building package…',`Packaging ${packageFiles.length} file(s), preserving relative paths.`);
    const json=JSON.stringify({version:1,files:packageFiles});
    
    setStatus('Step 4 of 8 · Compressing…','Using browser-native gzip. No upload is happening.');
    const compressed=await gzip(new TextEncoder().encode(json));
    
    setStatus('Step 5 of 8 · Encoding and splitting…','Converting compressed bytes to Base64 and making cookie-sized chunks.');
    const encoded=toBase64(compressed); const chunks=[]; for(let i=0;i<encoded.length;i+=CHUNK_SIZE) chunks.push(encoded.slice(i,i+CHUNK_SIZE));
    
    setStatus('Step 6 of 8 · Clearing old cookies…','Removing any previous CookieHost website from this browser.');
    clearCookies();
    
    setStatus('Step 7 of 8 · Writing cookies…',`Writing ${chunks.length} cookie chunk(s) to browser storage.`);
    document.cookie=`${PREFIX}count=${chunks.length}; Max-Age=31536000; Path=/; SameSite=Lax`;
    chunks.forEach((chunk,i)=>document.cookie=`${PREFIX}${String(i).padStart(4,'0')}=${encodeURIComponent(chunk)}; Max-Age=31536000; Path=/; SameSite=Lax`);
    
    setStatus('Step 8 of 8 · Verifying cookies…','Checking document.cookie to confirm every chunk was stored successfully.');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const cookies = getCookies();
    const count = Number(cookies[`${PREFIX}count`]);
    
    if (isNaN(count) || count !== chunks.length) throw new Error(`COOKIE_COUNT_MISMATCH:${count}:${chunks.length}`);
    
    let stored = 0;
    const missing = [];
    for (let i = 0; i < chunks.length; i++) {
      const name = `${PREFIX}${String(i).padStart(4,'0')}`;
      if (cookies[name]) stored++;
      else missing.push(name);
    }
    
    if (stored !== chunks.length) {
      const percent = Math.round((stored / chunks.length) * 100);
      throw new Error(`COOKIE_STORAGE_FAILED:${stored}:${chunks.length}:${missing.join(',')}`);
    }
    
    setStatus('Complete · Website baked! 🎉','All cookies verified and stored successfully.','success');
    const loadsiteUrl = window.location.pathname.includes('/cookiehost/') ? './loadsite/index.html' : './loadsite/index.html';
    resultBox.hidden=false; resultBox.innerHTML=`<h3>🍪 WEBSITE BAKED</h3><div class="stats"><div>Files<b>${packageFiles.length}</b></div><div>Original size<b>${prettyBytes(original)}</b></div><div>Compressed size<b>${prettyBytes(compressed.length)}</b></div><div>Cookie payload<b>${prettyBytes(encoded.length)}</b></div><div>Cookies needed<b>${chunks.length}</b></div><div>Cookies stored<b>${stored}/${chunks.length}</b></div></div><p>Your website is now cookies.</p><a class="primary-button open-button" href="${loadsiteUrl}">Open Website →</a>`;
  } catch (error) {
    let message = error.message;
    let kind = 'error';
    
    if (message === 'COOKIES_DISABLED') {
      message = 'Cookies are blocked in this browser. Enable cookies to use CookieHost.';
    } else if (message === 'GZIP_UNSUPPORTED') {
      message = 'This browser does not support native gzip compression. Use a modern browser.';
    } else if (message.startsWith('COOKIE_COUNT_MISMATCH')) {
      const [_, expected, actual] = message.split(':');
      message = `Cookie count mismatch. Expected to write ${expected} cookies, but browser shows ${actual}. This usually means cookies are blocked or storage is full.`;
    } else if (message.startsWith('COOKIE_STORAGE_FAILED')) {
      const parts = message.split(':');
      const stored = parts[1];
      const needed = parts[2];
      message = `Cookie storage failed. Only ${stored}/${needed} cookies were stored. The browser's cookie limit has been reached. Try a smaller website.`;
    }
    
    setStatus('Baking failed.',message,'error');
  }
});
renderFiles();
