// 최소 서비스워커 — PWA 설치 가능성을 위해 fetch 핸들러만 존재.
// 캐싱 안 함, 그냥 네트워크 그대로 통과.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
