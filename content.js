/**
 * =====================================================
 *  Threads Media Downloader & Upgrader — Content Script
 * =====================================================
 *
 *  Download images & videos from Threads with automatic
 *  quality enhancement (unlimited, no restrictions)
 */

(function () {
    'use strict';

    // ── Configuration ────────────────────────────────────
    const CONFIG = {
        CROP_MIN: 0.02,
        CROP_MAX: 0.04,
        HUE_SHIFT_MAX: 3,
        SATURATION_MIN: 0.97,
        SATURATION_MAX: 1.03,
        GAMMA_MIN: 0.97,
        GAMMA_MAX: 1.03,
        WARMTH_RANGE: 3,
        COLOR_SHIFT_RANGE: 4,
        NOISE_LEVEL: 2,
        JPEG_QUALITY_MIN: 0.92,
        JPEG_QUALITY_MAX: 0.96,
        ENABLE_FLIP: false,
        FILENAME_PREFIX: 'threads_enhanced',
        POLL_INTERVAL: 500,
    };

    // ── Utilities ────────────────────────────────────────

    function getTimestamp() {
        const n = new Date();
        return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}_${String(n.getHours()).padStart(2, '0')}${String(n.getMinutes()).padStart(2, '0')}${String(n.getSeconds()).padStart(2, '0')}`;
    }

    function uid() { return Math.random().toString(36).substring(2, 8); }
    function randRange(min, max) { return min + Math.random() * (max - min); }
    function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

    // ── Button Creation ──────────────────────────────────

    function createBtn(srcUrl) {
        const btn = document.createElement('button');
        btn.className = 'tmu-btn';

        const ico = document.createElement('span');
        ico.className = 'tmu-ico';
        btn.append(ico);

        const txt = document.createTextNode('다운로드');
        btn.append(txt);

        btn.setAttribute('data-src', srcUrl || '');
        btn.addEventListener('click', onBtnClick);
        return btn;
    }

    // ── Video Root Finder ────────────────────────────────

    function findRoot(el) {
        let parent = el.parentNode;
        if (!parent) return null;
        const vc = parent.querySelector('div[data-visualcompletion]');
        if (vc) return vc;
        return findRoot(parent);
    }

    // ── DOM Scanner ──────────────────────────────────────

    function observeDom() {
        document.querySelectorAll('video').forEach(video => {
            const root = findRoot(video);
            if (!root) return;
            if (root.querySelector('.tmu-btn')) return;
            root.append(createBtn(video.src || video.currentSrc || null));
        });

        document.querySelectorAll('img').forEach(img => {
            if (img.width < 200 || img.height < 200) return;
            if (img.parentElement.querySelector('.tmu-btn')) return;

            let bestUrl = img.src;
            if (img.srcset) {
                const candidates = img.srcset.split(',').map(s => {
                    const parts = s.trim().split(/\s+/);
                    return { url: parts[0], val: parseFloat(parts[1]) || 1 };
                });
                candidates.sort((a, b) => b.val - a.val);
                if (candidates.length > 0) bestUrl = candidates[0].url;
            }

            img.parentElement.prepend(createBtn(bestUrl));
        });
    }

    // ══════════════════════════════════════════════════════
    //  Download Handler (no usage limits)
    // ══════════════════════════════════════════════════════

    async function onBtnClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const btn = e.target.nodeName.toLowerCase() === 'button'
            ? e.target
            : e.target.parentElement;

        if (btn.classList.contains('tmu-loading')) return;

        const url = btn.getAttribute('data-src');
        if (!url) { setStatus(btn, 'err', 'No URL'); return; }

        // ── 다운로드 + 최적화 진행 ──
        setStatus(btn, 'loading', '업그레이드 중...');

        try {
            const blob = await fetchMedia(url);
            let result;

            if (blob.type && blob.type.startsWith('video')) {
                result = await enhanceVideo(blob);
            } else {
                result = await enhanceImage(blob);
            }

            await downloadBlob(result.blob, result.ext);
            setStatus(btn, 'done', '완료!');
        } catch (err) {
            console.error('[TMU] Error:', err);
            setStatus(btn, 'err', '실패');
        }
    }

    // ── Helper: send message to background ──────────────

    function sendMsg(msg) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(msg, (resp) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                resolve(resp);
            });
        });
    }

    // ── Status UI ────────────────────────────────────────

    function setStatus(btn, state, text) {
        btn.classList.remove('tmu-loading', 'tmu-done', 'tmu-err');
        const textNode = Array.from(btn.childNodes).find(n => n.nodeType === Node.TEXT_NODE);

        if (state === 'loading') {
            btn.classList.add('tmu-loading');
            if (textNode) textNode.textContent = text;
        } else if (state === 'done') {
            btn.classList.add('tmu-done');
            if (textNode) textNode.textContent = text;
            setTimeout(() => {
                btn.classList.remove('tmu-done');
                if (textNode) textNode.textContent = '다운로드';
            }, 2500);
        } else if (state === 'err') {
            btn.classList.add('tmu-err');
            if (textNode) textNode.textContent = text;
            setTimeout(() => {
                btn.classList.remove('tmu-err');
                if (textNode) textNode.textContent = '다운로드';
            }, 3000);
        }
    }

    // ── Media Fetch ──────────────────────────────────────

    async function fetchMedia(url) {
        try {
            const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.blob();
        } catch (err) {
            console.log('[TMU] Direct fetch failed, using background:', err.message);
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'fetchMedia', url }, (resp) => {
                    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                    if (!resp || !resp.success) return reject(new Error(resp?.error || 'fetch failed'));
                    fetch(resp.dataUrl).then(r => r.blob()).then(resolve).catch(reject);
                });
            });
        }
    }

    // ══════════════════════════════════════════════════════
    //  Image Enhancement Pipeline
    // ══════════════════════════════════════════════════════

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return [h * 360, s, l];
    }

    function hslToRgb(h, s, l) {
        h /= 360;
        let r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1; if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    async function enhanceImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const objUrl = URL.createObjectURL(blob);

            img.onload = () => {
                try {
                    const origW = img.naturalWidth;
                    const origH = img.naturalHeight;

                    // [1] Smart Reframing — crop + restore to original size
                    const cropRate = randRange(CONFIG.CROP_MIN, CONFIG.CROP_MAX);
                    const cropL = Math.floor(origW * cropRate * Math.random());
                    const cropT = Math.floor(origH * cropRate * Math.random());
                    const cropW = origW - Math.floor(origW * cropRate);
                    const cropH = origH - Math.floor(origH * cropRate);

                    const c = document.createElement('canvas');
                    c.width = origW;
                    c.height = origH;
                    const ctx = c.getContext('2d');

                    if (CONFIG.ENABLE_FLIP && Math.random() > 0.5) {
                        ctx.translate(origW, 0);
                        ctx.scale(-1, 1);
                    }

                    ctx.drawImage(img, cropL, cropT, cropW, cropH, 0, 0, origW, origH);
                    ctx.setTransform(1, 0, 0, 1, 0, 0);

                    // [2] Color Correction (HSL) + Balance + Noise
                    const imageData = ctx.getImageData(0, 0, origW, origH);
                    const d = imageData.data;

                    const hueShift = randRange(-CONFIG.HUE_SHIFT_MAX, CONFIG.HUE_SHIFT_MAX);
                    const satMult = randRange(CONFIG.SATURATION_MIN, CONFIG.SATURATION_MAX);
                    const gamma = randRange(CONFIG.GAMMA_MIN, CONFIG.GAMMA_MAX);
                    const warmth = randInt(-CONFIG.WARMTH_RANGE, CONFIG.WARMTH_RANGE);
                    const rShift = randInt(-CONFIG.COLOR_SHIFT_RANGE, CONFIG.COLOR_SHIFT_RANGE);
                    const gShift = randInt(-CONFIG.COLOR_SHIFT_RANGE, CONFIG.COLOR_SHIFT_RANGE);
                    const bShift = randInt(-CONFIG.COLOR_SHIFT_RANGE, CONFIG.COLOR_SHIFT_RANGE);
                    const nl = CONFIG.NOISE_LEVEL;
                    const invGamma = 1 / gamma;

                    for (let i = 0; i < d.length; i += 4) {
                        let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
                        h = (h + hueShift + 360) % 360;
                        s = Math.min(1, Math.max(0, s * satMult));
                        let [r, g, b] = hslToRgb(h, s, l);

                        r = Math.round(255 * Math.pow(r / 255, invGamma));
                        g = Math.round(255 * Math.pow(g / 255, invGamma));
                        b = Math.round(255 * Math.pow(b / 255, invGamma));

                        r += warmth; b -= warmth;

                        d[i] = Math.min(255, Math.max(0, r + rShift + randInt(-nl, nl)));
                        d[i + 1] = Math.min(255, Math.max(0, g + gShift + randInt(-nl, nl)));
                        d[i + 2] = Math.min(255, Math.max(0, b + bShift + randInt(-nl, nl)));
                    }
                    ctx.putImageData(imageData, 0, 0);

                    // [3] JPEG encoding
                    const quality = randRange(CONFIG.JPEG_QUALITY_MIN, CONFIG.JPEG_QUALITY_MAX);
                    const isPNG = blob.type === 'image/png';
                    const mime = isPNG ? 'image/png' : 'image/jpeg';
                    const ext = isPNG ? 'png' : 'jpg';

                    console.log(`[TMU] Enhanced: reframe=${(cropRate * 100).toFixed(1)}%, ` +
                        `hue=${hueShift.toFixed(1)}°, sat=${(satMult * 100).toFixed(0)}%, ` +
                        `gamma=${gamma.toFixed(3)}, quality=${(quality * 100).toFixed(0)}%`);

                    c.toBlob((b) => {
                        URL.revokeObjectURL(objUrl);
                        b ? resolve({ blob: b, ext }) : reject(new Error('toBlob failed'));
                    }, mime, isPNG ? undefined : quality);
                } catch (e) {
                    URL.revokeObjectURL(objUrl);
                    reject(e);
                }
            };
            img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('img load failed')); };
            img.src = objUrl;
        });
    }

    // ── Video Enhancement ────────────────────────────────

    async function enhanceVideo(blob) {
        let ext = 'mp4';
        if (blob.type) {
            if (blob.type.includes('webm')) ext = 'webm';
            else if (blob.type.includes('mov') || blob.type.includes('quicktime')) ext = 'mov';
        }
        return { blob, ext };
    }

    // ── File Download ────────────────────────────────────

    async function downloadBlob(blob, ext) {
        const filename = `${CONFIG.FILENAME_PREFIX}_${getTimestamp()}_${uid()}.${ext}`;
        const objUrl = URL.createObjectURL(blob);

        try {
            await sendMsg({ action: 'downloadFile', url: objUrl, filename });
        } catch (err) {
            console.log('[TMU] chrome.downloads failed, fallback:', err.message);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    }

    // ── Keep Alive ───────────────────────────────────────

    function keepAlive() {
        let port = chrome.runtime.connect();
        let dead = false;
        let timer = setTimeout(() => {
            if (port) { dead = true; port.disconnect(); }
            keepAlive();
        }, 295000);
        port.onDisconnect.addListener(() => {
            if (!dead) { clearTimeout(timer); keepAlive(); }
        });
    }

    // ── Initialize ───────────────────────────────────────

    keepAlive();
    setInterval(observeDom, CONFIG.POLL_INTERVAL);
    console.log('[TMU] Threads Media Upgrader initialized');

})();
