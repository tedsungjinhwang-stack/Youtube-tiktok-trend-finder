/**
 * Threads Media Downloader — Background Service Worker
 *
 * Handles CORS-bypassed media fetching and chrome.downloads API calls.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'fetchMedia') {
        fetchAsDataUrl(message.url)
            .then(dataUrl => sendResponse({ success: true, dataUrl }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (message.action === 'download') {
        chrome.downloads.download(
            { url: message.url, filename: message.filename, saveAs: false },
            downloadId => {
                const error = chrome.runtime.lastError;
                sendResponse(error
                    ? { success: false, error: error.message }
                    : { success: true, downloadId });
            }
        );
        return true;
    }
});

async function fetchAsDataUrl(url) {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
