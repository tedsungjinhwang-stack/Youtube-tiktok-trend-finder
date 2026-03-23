# Threads Media Downloader — Chrome Extension

## Project Overview
Threads(threads.net) 게시물의 이미지/영상을 다운로드하는 Chrome Extension (Manifest V3).
다운로드 시 이미지에 미세한 색보정·리프레이밍을 적용하여 고유한 결과물을 생성한다.

## Architecture

```
manifest.json      — Extension manifest (MV3)
background.js      — Service worker: CORS 우회 fetch, chrome.downloads API
content.js         — Content script: DOM 스캔, 버튼 주입, 이미지 보정 파이프라인
content.css        — 다운로드 버튼 스타일
icons/             — Extension 아이콘 (16, 48, 128px)
```

### Key Flows
1. **DOM 감시**: `MutationObserver`로 Threads 피드의 `<img>`, `<video>` 감지 → 다운로드 버튼 주입
2. **미디어 fetch**: content script에서 직접 fetch 시도 → 실패 시 background service worker로 CORS 우회
3. **이미지 보정**: Canvas API로 crop/reframe → HSL 색보정 + gamma + warmth + noise → JPEG/PNG 출력
4. **다운로드**: `chrome.downloads` API → 실패 시 `<a>` 태그 fallback

### Message Protocol (content ↔ background)
- `{ action: 'fetchMedia', url }` → `{ success, dataUrl }`
- `{ action: 'download', url, filename }` → `{ success, downloadId }`

## Tech Stack
- Vanilla JavaScript (no build tools, no dependencies)
- Chrome Extension Manifest V3
- Canvas API for image processing

## CSS Class Convention
- 접두사: `tmd-` (Threads Media Downloader)
- 상태 클래스: `tmd-loading`, `tmd-done`, `tmd-error`

## Development Notes
- 빌드 도구 없음. 파일 수정 후 `chrome://extensions`에서 리로드하면 됨
- `content.js`는 IIFE로 감싸져 있어 전역 오염 없음
- 이미지 보정 파라미터는 `content.js` 상단 `ENHANCE` 객체에서 조정
- 테스트: `https://www.threads.net` 에서 수동 확인
