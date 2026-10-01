const ALLOWED = new Set(['html','htm','css','js','json','txt','svg']);
const CHUNK_SIZE = 3000;
const PREFIX = 'cookiehost_';

const filesInput = document.querySelector('#site-files');
const dropZone = document.querySelector('#drop-zone');
const fileList = document.querySelector('#file-list');
const bakeButton = document.querySelector('#bake-button');
const statusBox = document.querySelector('#status');
const resultBox = document.querySelector('#result');
const continueButton = document.querySelector('#continue-button');
const unsupportedActions = document.querySelector('#unsupported-actions');

let selectedFiles = [];

const extension = name => (name.split('.').pop() || '').toLowerCase();

const prettyBytes = n => {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1048576).toFixed(1)} MB`;
};

const setStatus = (title, detail, kind = '') => {
  statusBox.className = `status ${kind}`;
  statusBox.querySelector('.status-title').textContent = title;
  statusBox.querySelector('.status-detail').textContent = detail;
};

function escapeHtml(str) {
  const map = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":"&#39;"};
  return String(str).replace(/[&<>"']/g, ch => map[ch]);
}

function getSupportedFiles() {
  return Array.from(selectedFiles).filter(f => ALLOWED.has(extension(f.name)));
}

function getUnsupportedFiles() {
  return Array.from(selectedFiles).filter(f => !ALLOWED.has(extension(f.name)));
}

function renderFiles() {
  if (selectedFiles.length === 0) {
    fileList.className = 'file-list empty';
    fileList.textContent = 'No files selected yet.';
    bakeButton.disabled = true;
    unsupportedActions.hidden = true;
    return;
  }

  const unsupported = getUnsupportedFiles();
  const supported = getSupportedFiles();

  fileList.className = 'file-list';
  fileList.innerHTML = Array.from(selectedFiles).map(file => {
    const isOk = ALLOWED.has(extension(file.name));
    const name = escapeHtml(file.name);
    const size = isOk ? prettyBytes(file.size) : 'UNSUPPORTED';
    return `<div class="file-row ${isOk ? '' : 'unsupported'}"><span>${name}</span><span>${size}</span></div>`;
  }).join('');

  unsupportedActions.hidden = unsupported.length === 0;
  bakeButton.disabled = supported.length === 0;
}

filesInput.addEventListener('change', (e) => {
  selectedFiles = e.target.files;
  renderFiles();
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  selectedFiles = e.dataTransfer.files;
  renderFiles();
});

continueButton.addEventListener('click', () => {
  const supported = getSupportedFiles();
  if (supported.length > 0) {
    selectedFiles = supported;
    setStatus('Continuing with supported files.', `${supported.length} file(s) will be baked.`, 'success');
    renderFiles();
  }
});

function clearCookies() {
  document.cookie.split(';').forEach(raw => {
    const name = raw.split('=')[0].trim();
    if (name === PREFIX + 'count' || name.startsWith(PREFIX)) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  });
}

function getCookies() {
  const map = {};
  document.cookie.split('; ').forEach(cookie => {
    if (!cookie) return;
    const idx = cookie.indexOf('=');
    const key = cookie.slice(0, idx);
    const val = decodeURIComponent(cookie.slice(idx + 1));
    map[key] = val;
  });
  return map;
}

function cookiesEnabled() {
  const testName = 'test_' + Date.now();
  document.cookie = `${testName}=1; Path=/; SameSite=Lax`;
  const found = document.cookie.includes(testName);
  if (found) {
    document.cookie = `${testName}=; Max-Age=0; Path=/`;
  }
  return found;
}

async function gzip(bytes) {
  if (!window.CompressionStream) {
    throw new Error('GZIP_NOT_AVAILABLE');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64(bytes) {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

bakeButton.addEventListener('click', async () => {
  resultBox.hidden = true;

  const unsupported = getUnsupportedFiles();
  if (unsupported.length > 0) {
    setStatus('Unsupported files found.', `${unsupported.length} file(s) cannot be baked. Use "Continue without unsupported files" to bake only allowed files.`, 'error');
    return;
  }

  const supported = getSupportedFiles();
  if (supported.length === 0) {
    setStatus('No files to bake.', 'Select at least one supported file.', 'error');
    return;
  }

  try {
    setStatus('Step 1 of 8 · Checking browser support…', 'Verifying that cookies and gzip are available.');
    if (!cookiesEnabled()) throw new Error('COOKIES_BLOCKED');
    if (!window.CompressionStream) throw new Error('GZIP_NOT_AVAILABLE');

    setStatus('Step 2 of 8 · Reading files…', 'Reading selected files from your computer.');
    const files = [];
    let originalSize = 0;
    for (const file of supported) {
      const text = await file.text();
      originalSize += new TextEncoder().encode(text).length;
      files.push({ path: file.name, content: text });
    }

    setStatus('Step 3 of 8 · Building package…', `Packaging ${files.length} file(s).`);
    const pkg = JSON.stringify({ version: 1, files });

    setStatus('Step 4 of 8 · Compressing…', 'Using gzip compression.');
    const compressed = await gzip(new TextEncoder().encode(pkg));

    setStatus('Step 5 of 8 · Encoding…', 'Converting to Base64 and splitting into chunks.');
    const encoded = toBase64(compressed);
    const chunks = [];
    for (let i = 0; i < encoded.length; i += CHUNK_SIZE) {
      chunks.push(encoded.slice(i, i + CHUNK_SIZE));
    }

    setStatus('Step 6 of 8 · Clearing old cookies…', 'Removing any previous CookieHost website.');
    clearCookies();

    setStatus('Step 7 of 8 · Writing cookies…', `Writing ${chunks.length} cookie(s).`);
    document.cookie = `${PREFIX}count=${chunks.length}; Max-Age=31536000; Path=/; SameSite=Lax`;
    chunks.forEach((chunk, i) => {
      const name = `${PREFIX}${String(i).padStart(4, '0')}`;
      document.cookie = `${name}=${encodeURIComponent(chunk)}; Max-Age=31536000; Path=/; SameSite=Lax`;
    });

    setStatus('Step 8 of 8 · Verifying cookies…', 'Checking that all chunks were stored.');
    await new Promise(r => setTimeout(r, 200));

    const cookies = getCookies();
    const stored = chunks.filter((_, i) => {
      const name = `${PREFIX}${String(i).padStart(4, '0')}`;
      return name in cookies;
    }).length;

    if (stored !== chunks.length) {
      throw new Error(`STORAGE_FAILED:${stored}:${chunks.length}`);
    }

    setStatus('Complete · Website baked! 🎉', 'All cookies verified and stored.', 'success');
    resultBox.hidden = false;
    resultBox.innerHTML = `
      <h3>🍪 WEBSITE BAKED</h3>
      <div class="stats">
        <div>Files<b>${files.length}</b></div>
        <div>Original size<b>${prettyBytes(originalSize)}</b></div>
        <div>Compressed size<b>${prettyBytes(compressed.length)}</b></div>
        <div>Cookie payload<b>${prettyBytes(encoded.length)}</b></div>
        <div>Cookies needed<b>${chunks.length}</b></div>
        <div>Cookies stored<b>${stored}/${chunks.length}</b></div>
      </div>
      <p>Your website is now stored in cookies.</p>
      <a class="primary-button open-button" href="./loadsite.html">Open Website →</a>
    `;
  } catch (err) {
    let msg = err.message;
    if (msg === 'COOKIES_BLOCKED') {
      msg = 'Cookies are blocked in this browser. Enable cookies to use CookieHost.';
    } else if (msg === 'GZIP_NOT_AVAILABLE') {
      msg = 'This browser does not support gzip. Use a modern browser.';
    } else if (msg.startsWith('STORAGE_FAILED')) {
      const parts = msg.split(':');
      const stored = parts[1];
      const needed = parts[2];
      msg = `Only ${stored}/${needed} cookies were stored. Browser limit reached. Try a smaller website.`;
    }
    setStatus('Baking failed.', msg, 'error');
  }
});

renderFiles();
