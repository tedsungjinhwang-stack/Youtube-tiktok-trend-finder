/**
 * Threads Media Downloader — Content Script
 *
 * Injects download buttons on Threads posts and handles
 * image enhancement + video download.
 */

(function () {
    'use strict';

    // ── Config ────────────────────────────────────────────

    const ENHANCE = {
        cropMin: 0.02,
        cropMax: 0.04,
        hueShiftMax: 3,
        saturationRange: [0.97, 1.03],
        gammaRange: [0.97, 1.03],
        warmthMax: 3,
        colorShiftMax: 4,
        noiseLevel: 2,
        jpegQualityRange: [0.92, 0.96],
        enableFlip: false,
    };

    const MIN_IMAGE_SIZE = 200;
    const FILENAME_PREFIX = 'threads_enhanced';
    const BTN_CLASS = 'tmd-btn';
    const ICON_CLASS = 'tmd-ico';

    // ── Utilities ─────────────────────────────────────────

    const rand = (min, max) => min + Math.random() * (max - min);
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const clamp = (val, min = 0, max = 255) => Math.min(max, Math.max(min, val));
    const uid = () => Math.random().toString(36).slice(2, 8);

    function timestamp() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    function sendToBackground(msg) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(msg, resp => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                resolve(resp);
            });
        });
    }

    // ── DOM: Button Factory ───────────────────────────────

    function createDownloadButton(mediaUrl) {
        const btn = document.createElement('button');
        btn.className = BTN_CLASS;
        btn.dataset.src = mediaUrl || '';

        const icon = document.createElement('span');
        icon.className = ICON_CLASS;
        btn.append(icon, document.createTextNode('Download'));

        btn.addEventListener('click', handleDownloadClick);
        return btn;
    }

    // ── DOM: Post Scanner ─────────────────────────────────

    function findPostContainer(el) {
        const parent = el.closest('[data-visualcompletion]');
        if (parent) return parent;

        let node = el.parentNode;
        while (node && node !== document.body) {
            const vc = node.querySelector('[data-visualcompletion]');
            if (vc) return vc;
            node = node.parentNode;
        }
        return null;
    }

    function getBestImageUrl(img) {
        if (!img.srcset) return img.src;

        const candidates = img.srcset.split(',').map(entry => {
            const [url, descriptor] = entry.trim().split(/\s+/);
            return { url, size: parseFloat(descriptor) || 1 };
        });
        candidates.sort((a, b) => b.size - a.size);
        return candidates[0]?.url || img.src;
    }

    function injectButtons() {
        // Videos
        document.querySelectorAll('video').forEach(video => {
            const container = findPostContainer(video);
            if (!container || container.querySelector(`.${BTN_CLASS}`)) return;
            container.append(createDownloadButton(video.src || video.currentSrc));
        });

        // Images (skip small icons/avatars)
        document.querySelectorAll('img').forEach(img => {
            if (img.width < MIN_IMAGE_SIZE || img.height < MIN_IMAGE_SIZE) return;
            if (img.parentElement.querySelector(`.${BTN_CLASS}`)) return;
            img.parentElement.prepend(createDownloadButton(getBestImageUrl(img)));
        });
    }

    // ── DOM: MutationObserver ─────────────────────────────

    function startObserver() {
        injectButtons();

        const observer = new MutationObserver(() => injectButtons());
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ── Download Handler ──────────────────────────────────

    async function handleDownloadClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const btn = e.target.closest(`.${BTN_CLASS}`);
        if (!btn || btn.classList.contains('tmd-loading')) return;

        const url = btn.dataset.src;
        if (!url) return setBtnState(btn, 'error', 'No URL');

        setBtnState(btn, 'loading', 'Enhancing...');

        try {
            const blob = await fetchMedia(url);
            const isVideo = blob.type?.startsWith('video');
            const result = isVideo ? passthrough(blob) : await enhanceImage(blob);

            await downloadBlob(result.blob, result.ext);
            setBtnState(btn, 'done', 'Done!');
        } catch (err) {
            console.error('[TMD]', err);
            setBtnState(btn, 'error', 'Failed');
        }
    }

    // ── Button State ──────────────────────────────────────

    function setBtnState(btn, state, label) {
        btn.classList.remove('tmd-loading', 'tmd-done', 'tmd-error');
        const textNode = [...btn.childNodes].find(n => n.nodeType === Node.TEXT_NODE);

        if (state === 'loading') {
            btn.classList.add('tmd-loading');
            if (textNode) textNode.textContent = label;
            return;
        }

        const cssClass = state === 'done' ? 'tmd-done' : 'tmd-error';
        btn.classList.add(cssClass);
        if (textNode) textNode.textContent = label;

        setTimeout(() => {
            btn.classList.remove(cssClass);
            if (textNode) textNode.textContent = 'Download';
        }, state === 'done' ? 2500 : 3000);
    }

    // ── Media Fetch (direct → background fallback) ───────

    async function fetchMedia(url) {
        try {
            const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.blob();
        } catch {
            const resp = await sendToBackground({ action: 'fetchMedia', url });
            if (!resp?.success) throw new Error(resp?.error || 'Background fetch failed');
            return fetch(resp.dataUrl).then(r => r.blob());
        }
    }

    // ── Video Passthrough ─────────────────────────────────

    function passthrough(blob) {
        const type = blob.type || '';
        let ext = 'mp4';
        if (type.includes('webm')) ext = 'webm';
        else if (type.includes('quicktime') || type.includes('mov')) ext = 'mov';
        return { blob, ext };
    }

    // ── Image Enhancement ─────────────────────────────────

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return [h * 360, s, l];
    }

    function hslToRgb(h, s, l) {
        h /= 360;
        if (s === 0) {
            const v = Math.round(l * 255);
            return [v, v, v];
        }
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return [
            Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
            Math.round(hue2rgb(p, q, h) * 255),
            Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
        ];
    }

    function enhanceImage(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const objectUrl = URL.createObjectURL(blob);

            img.onload = () => {
                try {
                    const { naturalWidth: w, naturalHeight: h } = img;
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');

                    // 1) Smart reframe: slight crop then scale back to original size
                    const cropRatio = rand(ENHANCE.cropMin, ENHANCE.cropMax);
                    const cropX = Math.floor(w * cropRatio * Math.random());
                    const cropY = Math.floor(h * cropRatio * Math.random());
                    const cropW = w - Math.floor(w * cropRatio);
                    const cropH = h - Math.floor(h * cropRatio);

                    if (ENHANCE.enableFlip && Math.random() > 0.5) {
                        ctx.translate(w, 0);
                        ctx.scale(-1, 1);
                    }
                    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, w, h);
                    ctx.setTransform(1, 0, 0, 1, 0, 0);

                    // 2) Pixel-level color adjustments
                    const imageData = ctx.getImageData(0, 0, w, h);
                    const pixels = imageData.data;

                    const hueShift = rand(-ENHANCE.hueShiftMax, ENHANCE.hueShiftMax);
                    const satMult = rand(...ENHANCE.saturationRange);
                    const gamma = rand(...ENHANCE.gammaRange);
                    const invGamma = 1 / gamma;
                    const warmth = randInt(-ENHANCE.warmthMax, ENHANCE.warmthMax);
                    const rShift = randInt(-ENHANCE.colorShiftMax, ENHANCE.colorShiftMax);
                    const gShift = randInt(-ENHANCE.colorShiftMax, ENHANCE.colorShiftMax);
                    const bShift = randInt(-ENHANCE.colorShiftMax, ENHANCE.colorShiftMax);
                    const noise = ENHANCE.noiseLevel;

                    for (let i = 0; i < pixels.length; i += 4) {
                        let [hue, sat, light] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
                        hue = (hue + hueShift + 360) % 360;
                        sat = clamp(sat * satMult, 0, 1);

                        let [r, g, b] = hslToRgb(hue, sat, light);
                        r = Math.round(255 * Math.pow(r / 255, invGamma));
                        g = Math.round(255 * Math.pow(g / 255, invGamma));
                        b = Math.round(255 * Math.pow(b / 255, invGamma));

                        pixels[i] = clamp(r + warmth + rShift + randInt(-noise, noise));
                        pixels[i + 1] = clamp(g + gShift + randInt(-noise, noise));
                        pixels[i + 2] = clamp(b - warmth + bShift + randInt(-noise, noise));
                    }
                    ctx.putImageData(imageData, 0, 0);

                    // 3) Export
                    const isPng = blob.type === 'image/png';
                    const mime = isPng ? 'image/png' : 'image/jpeg';
                    const ext = isPng ? 'png' : 'jpg';
                    const quality = isPng ? undefined : rand(...ENHANCE.jpegQualityRange);

                    canvas.toBlob(
                        out => {
                            URL.revokeObjectURL(objectUrl);
                            out ? resolve({ blob: out, ext }) : reject(new Error('Canvas toBlob failed'));
                        },
                        mime,
                        quality
                    );
                } catch (err) {
                    URL.revokeObjectURL(objectUrl);
                    reject(err);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error('Image load failed'));
            };
            img.src = objectUrl;
        });
    }

    // ── File Download ─────────────────────────────────────

    async function downloadBlob(blob, ext) {
        const filename = `${FILENAME_PREFIX}_${timestamp()}_${uid()}.${ext}`;
        const objectUrl = URL.createObjectURL(blob);

        try {
            await sendToBackground({ action: 'download', url: objectUrl, filename });
        } catch {
            // Fallback: anchor click download
            const a = Object.assign(document.createElement('a'), {
                href: objectUrl,
                download: filename,
            });
            document.body.appendChild(a);
            a.click();
            a.remove();
        }

        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    }

    // ── Init ──────────────────────────────────────────────

    startObserver();
    console.log('[TMD] Threads Media Downloader initialized');

})();
