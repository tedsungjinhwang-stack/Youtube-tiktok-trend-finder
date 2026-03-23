/**
 * Threads Media Downloader & Upgrader — Background Service Worker
 *
 * 1) CORS-free media fetching
 * 2) chrome.downloads API
 */

// Keep-alive
chrome.runtime.onConnect.addListener(function (port) { });

// ── Message Handler ─────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // 미디어 fetch (CORS 우회)
    if (message.action === 'fetchMedia') {
        fetchMediaAsDataUrl(message.url)
            .then(dataUrl => sendResponse({ success: true, dataUrl }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    // 파일 다운로드
    if (message.action === 'downloadFile') {
        chrome.downloads.download({
            url: message.url,
            filename: message.filename,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId });
            }
        });
        return true;
    }
});

// ── Media Fetch ─────────────────────────────────────────

async function fetchMediaAsDataUrl(url) {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
