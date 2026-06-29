/* ── State ── */
const state = {
  docs: [],        // [{ doc_id, filename, chunks }]
  activeDocId: null,
  streaming: false,
};

/* ── DOM refs ── */
const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const uploadStatus  = document.getElementById('upload-status');
const uploadText    = document.getElementById('upload-status-text');
const docListEl     = document.getElementById('doc-list');
const resetBtn      = document.getElementById('reset-btn');
const welcome       = document.getElementById('welcome');
const messagesEl    = document.getElementById('messages');
const questionInput = document.getElementById('question-input');
const sendBtn       = document.getElementById('send-btn');
const statusDot     = document.getElementById('status-dot');
const chatTitle     = document.getElementById('chat-title');
const chatSubtitle  = document.getElementById('chat-subtitle');

/* ── Toast ── */
function toast(msg, type = 'info', ms = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ── Escape helper ── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─────────────── Upload ─────────────── */
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleUpload(fileInput.files[0]);
  fileInput.value = '';
});

async function handleUpload(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'txt'].includes(ext)) { toast('Only PDF and TXT files are supported.', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('File exceeds 10 MB limit.', 'error'); return; }

  uploadStatus.classList.add('show');
  uploadText.textContent = `Processing ${file.name}…`;

  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) { toast(data.detail || 'Upload failed.', 'error'); return; }

    state.docs.push({ doc_id: data.doc_id, filename: data.filename, chunks: data.chunks });
    renderDocList();
    setActiveDoc(data.doc_id);
    toast(`"${data.filename}" — ${data.chunks} chunks indexed`, 'success');
  } catch (err) {
    toast('Upload error: ' + err.message, 'error');
  } finally {
    uploadStatus.classList.remove('show');
  }
}

/* ─────────────── Document list ─────────────── */
function renderDocList() {
  docListEl.innerHTML = '';
  if (!state.docs.length) {
    docListEl.innerHTML = '<p class="empty-docs">No documents yet</p>';
    return;
  }
  state.docs.forEach(doc => {
    const item = document.createElement('div');
    item.className = 'doc-item' + (doc.doc_id === state.activeDocId ? ' active' : '');
    const icon = doc.filename.endsWith('.pdf') ? '📕' : '📄';
    item.innerHTML = `
      <span class="doc-icon">${icon}</span>
      <div class="doc-info">
        <div class="doc-name" title="${esc(doc.filename)}">${esc(doc.filename)}</div>
        <div class="doc-meta">${doc.chunks} chunks</div>
      </div>`;
    item.addEventListener('click', () => setActiveDoc(doc.doc_id));
    docListEl.appendChild(item);
  });
}

function setActiveDoc(docId) {
  state.activeDocId = docId;
  const doc = state.docs.find(d => d.doc_id === docId);
  renderDocList();

  welcome.style.display = 'none';
  messagesEl.style.display = 'flex';
  questionInput.disabled = false;
  sendBtn.disabled = false;
  questionInput.placeholder = `Ask about "${doc.filename}"…`;
  statusDot.classList.remove('inactive');
  chatTitle.textContent = doc.filename;
  chatSubtitle.textContent = `${doc.chunks} indexed chunks · ready`;
  questionInput.focus();
}

/* ─────────────── Reset ─────────────── */
resetBtn.addEventListener('click', async () => {
  if (!confirm('Clear all documents? This cannot be undone.')) return;
  try {
    const res = await fetch('/reset', { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); toast(d.detail || 'Reset failed.', 'error'); return; }
    state.docs = [];
    state.activeDocId = null;
    renderDocList();
    messagesEl.innerHTML = '';
    messagesEl.style.display = 'none';
    welcome.style.display = 'flex';
    questionInput.disabled = true;
    sendBtn.disabled = true;
    questionInput.placeholder = 'Ask a question about your document…';
    statusDot.classList.add('inactive');
    chatTitle.textContent = 'RAG Chatbot';
    chatSubtitle.textContent = 'Upload a document to start chatting';
    toast('All documents cleared.', 'info');
  } catch (err) {
    toast('Reset error: ' + err.message, 'error');
  }
});

/* ─────────────── Chat ─────────────── */
questionInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
questionInput.addEventListener('input', () => {
  questionInput.style.height = 'auto';
  questionInput.style.height = Math.min(questionInput.scrollHeight, 160) + 'px';
});
sendBtn.addEventListener('click', sendMessage);

async function sendMessage() {
  const question = questionInput.value.trim();
  if (!question || state.streaming) return;

  appendMessage('user', question);
  questionInput.value = '';
  questionInput.style.height = 'auto';
  setStreaming(true);

  const botMsg = appendMessage('bot', '');
  const textSpan = botMsg.querySelector('.msg-text');
  const cursor = Object.assign(document.createElement('span'), { className: 'cursor' });
  textSpan.appendChild(cursor);

  let fullText = '';
  let pendingEvent = null;

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, doc_id: state.activeDocId }),
    });

    if (!res.ok) {
      const d = await res.json();
      cursor.remove();
      textSpan.textContent = d.detail || 'Server error.';
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    const processLine = line => {
      if (line.startsWith('event: ')) { pendingEvent = line.slice(7).trim(); return; }
      if (!line.startsWith('data: ')) return;
      const raw = line.slice(6);
      if (raw === '[DONE]') { cursor.remove(); return; }
      try {
        const parsed = JSON.parse(raw);
        if (pendingEvent === 'sources' && Array.isArray(parsed)) {
          botMsg.querySelector('.bubble').appendChild(buildSources(parsed));
        } else if (parsed.token !== undefined) {
          fullText += parsed.token;
          textSpan.textContent = fullText;
          textSpan.appendChild(cursor);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      } catch (_) {}
      pendingEvent = null;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) { cursor.remove(); break; }
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach(processLine);
    }

  } catch (err) {
    cursor.remove();
    textSpan.textContent = 'Error: ' + err.message;
  } finally {
    setStreaming(false);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

/* ─────────────── Helpers ─────────────── */
function appendMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  const avatar = role === 'user' ? '👤' : '🤖';
  msg.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div class="bubble"><span class="msg-text">${esc(text)}</span></div>`;
  messagesEl.appendChild(msg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return msg;
}

function buildSources(sources) {
  const div = document.createElement('div');
  div.className = 'citations';
  div.innerHTML = '<div class="citation-label">Sources</div>';
  sources.forEach(s => {
    const item = document.createElement('div');
    item.className = 'citation-item';
    item.innerHTML = `📎 ${esc(s.filename)} · chunk ${s.chunk_index + 1}<span class="citation-score">${(s.score * 100).toFixed(0)}% match</span>`;
    div.appendChild(item);
  });
  return div;
}

function setStreaming(val) {
  state.streaming = val;
  sendBtn.disabled = val;
  questionInput.disabled = val;
}
