/**
 * Media download utility
 */

import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

const uid = () => Math.random().toString(36).slice(2, 8);

function timestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function guessExtension(url, contentType, mediaType) {
    if (mediaType === 'video') {
        if (url.includes('.webm') || contentType?.includes('webm')) return 'webm';
        if (url.includes('.mov') || contentType?.includes('quicktime')) return 'mov';
        return 'mp4';
    }
    if (url.includes('.png') || contentType?.includes('png')) return 'png';
    if (url.includes('.webp') || contentType?.includes('webp')) return 'webp';
    return 'jpg';
}

export async function downloadMedia(url, mediaType, outputDir = './downloads') {
    await fs.mkdir(outputDir, { recursive: true });

    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
    });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

    const contentType = res.headers.get('content-type');
    const ext = guessExtension(url, contentType, mediaType);
    const filename = `threads_${timestamp()}_${uid()}.${ext}`;
    const filePath = path.join(outputDir, filename);

    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    return filePath;
}
