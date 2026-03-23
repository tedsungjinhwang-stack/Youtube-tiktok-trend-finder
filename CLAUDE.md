# Threads Media Downloader

Threads(threads.net) 게시물에서 이미지/영상을 다운로드하고, 이미지에 미세 보정을 적용하는 CLI 도구.

## Quick Start

```bash
npm install
node index.js <threads-url>
```

## Usage

```bash
# 기본 (다운로드 + 이미지 보정)
node index.js https://www.threads.net/@user/post/ABC123

# 출력 디렉토리 지정
node index.js https://www.threads.net/@user/post/ABC123 -o ./media

# 보정 없이 원본 저장
node index.js https://www.threads.net/@user/post/ABC123 --no-enhance
```

## Architecture

```
index.js             — 진입점, CLI 실행 흐름
lib/
  cli.js             — 인자 파싱, 도움말 출력
  scraper.js         — Threads 페이지 fetch → 미디어 URL 추출
  enhance.js         — Sharp 기반 이미지 보정 (crop, 색보정, noise)
  download.js        — 미디어 다운로드 + 파일 저장
```

### Flow
1. **scraper**: Threads URL → HTML fetch → og:meta / JSON / CDN URL에서 미디어 추출
2. **download**: 미디어 URL → `./downloads/` 에 파일 저장
3. **enhance**: Sharp로 crop → saturation/brightness/hue/gamma 조정 → noise overlay → 덮어쓰기

## Dependencies
- `node-fetch` — HTTP 요청
- `sharp` — 이미지 처리 (crop, color, resize, composite)

## Enhancement Parameters
`lib/enhance.js` 상단 `ENHANCE` 객체에서 조정:
- `cropMin/cropMax` — 리프레이밍 비율 (2~4%)
- `hueShiftMax` — 색조 이동 범위 (±3°)
- `saturationRange` — 채도 배율 (0.97~1.03)
- `gammaRange` — 감마 보정 (0.97~1.03)
- `noiseLevel` — 노이즈 강도 (0이면 비활성)
- `jpegQuality` — JPEG 출력 품질 (93)
