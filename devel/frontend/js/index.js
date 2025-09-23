const API_PREFIX = '/api';
const itemsEl = document.getElementById('items');
const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.querySelector('#progressBar > i');
const progressText = document.getElementById('progressText');

async function fetchMedia() {
        try {
                const res = await fetch(`${API_PREFIX}/media`);
                const data = await res.json();
                renderList(data);
        } catch (e) {
                itemsEl.innerHTML = `<div style="color:#b00">Failed to load media: ${e.message}</div>`;
        }
}

function renderList(list) {
        if (!list.length) {
                itemsEl.innerHTML = '<div class="item">No media uploaded yet.</div>';
                return;
        }
        itemsEl.innerHTML = '';
        list.forEach(m => {
                const div = document.createElement('div');
                div.className = 'item';
                div.innerHTML = `
      <div class="meta">
        <div><strong>${escapeHtml(m.filename)}</strong></div>
        <div><small class="gray">uploaded: ${m.created_at || ''}</small></div>
        <div style="margin-top:6px;"><span class="status">${m.status.toUpperCase()}</span> ${m.message ? '- ' + escapeHtml(m.message) : ''}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <a class="btn" href="/player.html?id=${m.id}" target="_blank">Open in player</a>
      </div>
    `;
                itemsEl.appendChild(div);
        });
}

function escapeHtml(s='') {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

uploadForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const file = fileInput.files[0];
        if (!file) return alert('Select a file first');
        // prepare formdata
        const fd = new FormData();
        fd.append('file', file);
        progressWrap.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = 'Starting upload...';

        try {
                // use XHR to get progress events
                await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', `${API_PREFIX}/upload`);
                        xhr.onload = () => {
                                if (xhr.status >= 200 && xhr.status < 300) {
                                        resolve(xhr.responseText);
                                } else {
                                        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText} ${xhr.responseText || ''}`));
                                }
                        };
                        xhr.onerror = () => reject(new Error('Network error during upload'));
                        xhr.upload.onprogress = (e) => {
                                if (e.lengthComputable) {
                                        const pct = Math.round((e.loaded / e.total) * 100);
                                        progressBar.style.width = pct + '%';
                                        progressText.textContent = `Uploading: ${pct}% (${formatBytes(e.loaded)} / ${formatBytes(e.total)})`;
                                } else {
                                        progressText.textContent = `Uploaded ${formatBytes(e.loaded)}`;
                                }
                        };
                        xhr.send(fd);
                });

                progressText.textContent = 'Upload complete - transcoding starting...';
                // poll list/status until processing finishes
                pollUntilReady();
        } catch (err) {
                progressText.textContent = 'Error: ' + err.message;
                progressBar.style.width = '0%';
                console.error(err);
        }
});

// poll library until any 'queued'/'processing' becomes 'ready' or timeout
async function pollUntilReady(timeoutSec=600) {
        const end = Date.now() + timeoutSec * 1000;
        // simple poll: refresh list every 3s and look for any processing -> ready
        const interval = 3000;
        while (Date.now() < end) {
                await fetchMedia();
                // stop if no items are processing
                const processing = Array.from(itemsEl.querySelectorAll('.status')).some(el => {
                        const s = el.textContent.toLowerCase();
                        return s.includes('queued') || s.includes('processing');
                });
                if (!processing) break;
                await new Promise(r => setTimeout(r, interval));
        }
        progressText.textContent = 'Done. See library below.';
        progressBar.style.width = '100%';
        setTimeout(()=>{ progressWrap.style.display='none'; progressBar.style.width='0%'; }, 1500);
}

function formatBytes(n){
        if (n < 1024) return n + ' B';
        if (n < 1024*1024) return (n/1024).toFixed(1) + ' KB';
        if (n < 1024*1024*1024) return (n/(1024*1024)).toFixed(1) + ' MB';
        return (n/(1024*1024*1024)).toFixed(2) + ' GB';
}

// initial load
fetchMedia();
// refresh library every 10s
setInterval(fetchMedia, 10000);
