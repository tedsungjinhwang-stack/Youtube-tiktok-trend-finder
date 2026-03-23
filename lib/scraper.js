/**
 * Threads media URL scraper
 *
 * Fetches a Threads post page and extracts image/video URLs
 * from the embedded JSON data.
 */

import fetch from 'node-fetch';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchThreadsMedia(postUrl) {
    const html = await fetchPage(postUrl);
    const media = [];

    // Extract from og:image / og:video meta tags
    const ogImages = extractMeta(html, 'og:image');
    const ogVideos = extractMeta(html, 'og:video');

    ogImages.forEach(url => media.push({ url, type: 'image' }));
    ogVideos.forEach(url => media.push({ url, type: 'video' }));

    // Extract from embedded JSON (data script tags)
    const jsonMedia = extractFromJson(html);
    jsonMedia.forEach(item => {
        if (!media.some(m => m.url === item.url)) {
            media.push(item);
        }
    });

    // Extract direct image/video URLs from HTML
    const directMedia = extractDirectUrls(html);
    directMedia.forEach(item => {
        if (!media.some(m => m.url === item.url)) {
            media.push(item);
        }
    });

    return media;
}

async function fetchPage(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });
    if (!res.ok) throw new Error(`Failed to fetch page: HTTP ${res.status}`);
    return res.text();
}

function extractMeta(html, property) {
    const regex = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'gi');
    const urls = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        urls.push(decodeHtmlEntities(match[1]));
    }
    return urls;
}

function extractFromJson(html) {
    const media = [];
    const scriptRegex = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = scriptRegex.exec(html)) !== null) {
        try {
            const data = JSON.parse(match[1]);
            findMediaInObject(data, media);
        } catch {
            // Not valid JSON, skip
        }
    }
    return media;
}

function findMediaInObject(obj, results) {
    if (!obj || typeof obj !== 'object') return;

    if (typeof obj.url === 'string' || typeof obj.uri === 'string') {
        const url = obj.url || obj.uri;
        if (isMediaUrl(url)) {
            const type = isVideoUrl(url) ? 'video' : 'image';
            results.push({ url, type });
        }
    }

    // Check for image_versions / video_versions patterns (Instagram API format)
    if (obj.image_versions2?.candidates) {
        const best = obj.image_versions2.candidates[0];
        if (best?.url) results.push({ url: best.url, type: 'image' });
    }
    if (obj.video_versions) {
        const best = obj.video_versions[0];
        if (best?.url) results.push({ url: best.url, type: 'video' });
    }

    for (const val of Object.values(obj)) {
        if (Array.isArray(val)) val.forEach(item => findMediaInObject(item, results));
        else if (typeof val === 'object') findMediaInObject(val, results);
    }
}

function extractDirectUrls(html) {
    const media = [];
    const urlRegex = /https?:\/\/[^"'\s]+\.cdninstagram\.com\/[^"'\s]+/g;
    let match;
    while ((match = urlRegex.exec(html)) !== null) {
        const url = decodeHtmlEntities(match[0]);
        const type = isVideoUrl(url) ? 'video' : 'image';
        if (!media.some(m => m.url === url)) {
            media.push({ url, type });
        }
    }
    return media;
}

function isMediaUrl(url) {
    return url.includes('cdninstagram.com') || url.includes('fbcdn.net');
}

function isVideoUrl(url) {
    return /\.(mp4|webm|mov)/i.test(url) || url.includes('video');
}

function decodeHtmlEntities(str) {
    return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
