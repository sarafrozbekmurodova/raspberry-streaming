// sources:
//      https://github.com/video-dev/hls.js/blob/master/docs/API.md#getting-started
function paramId() {
        try {
                const p = new URLSearchParams(location.search);
                return p.get('id');
        } catch (e) { return null; }
}

const id = paramId();
const info = document.getElementById('info');
const playerArea = document.getElementById('playerArea');
const links = document.getElementById('links');

if (!id) {
        info.innerHTML = '<span class="err">No video id provided.</span> Use ?id=&lt;id&gt; in the URL or open from the library.';
} else {
        const hlsUrl = `/hls/${encodeURIComponent(id)}/playlist.m3u8`;
        info.textContent = `Loading stream for id: ${id}`;
        // show basic links
        links.innerHTML = `<a class="btn" href="/">Back to Library</a>`;

        // Create video element
        const v = document.createElement('video');
        v.controls = true;
        v.playsInline = true;
        v.setAttribute('autoplay', '');
        playerArea.appendChild(v);

        // Choose native or hls.js
        if (v.canPlayType('application/vnd.apple.mpegurl')) {
                // native (Safari)
                v.src = hlsUrl;
                v.addEventListener('loadedmetadata', () => {
                        info.textContent = `Playing (native HLS) - id: ${id}`;
                });
                v.addEventListener('error', (e) => {
                        info.innerHTML = '<span class="err">Playback error (native): check the console.</span>';
                        console.error('Native playback error', e);
                });
        } else if (window.Hls && Hls.isSupported()) {
                const hls = new Hls();
                hls.attachMedia(v);
                hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                        info.textContent = 'hls.js attached - loading manifest...';
                        hls.loadSource(hlsUrl);
                });
                hls.on(Hls.Events.MANIFEST_PARSED, (evt, data) => {
                        info.textContent = `Playing (hls.js)`;
                        v.play().catch(()=>{ /* autoplay may be blocked */ });
                });
                hls.on(Hls.Events.ERROR, (event, data) => {
                        console.error('hls.js error', data);
                        if (data.fatal) {
                                info.innerHTML = '<span class="err">Playback fatal error - see console.</span>';
                                hls.destroy();
                        }
                });
        } else {
                playerArea.innerHTML = '<div class="err">Your browser does not support HLS playback.</div>';
        }
}
