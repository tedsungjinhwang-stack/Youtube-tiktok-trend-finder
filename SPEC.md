# SPEC — Trend Finder

본인 전용 TikTok / Instagram / YouTube 트렌드 영상 파인더. pint.kr 의 watchlist + hot-videos 컨셉을 차용해 자체 도메인에 맞게 재구성.

## 한 줄 요약
**에셋 채널을 폴더(카테고리)로 묶어 등록 → Apify(TT/IG)와 YouTube API로 영상 수집 → 카테고리·플랫폼·기간·정렬·임계치로 필터링해 "터진 영상 / 심정지 영상" 식별.**

---

## 1. 핵심 개념

| 용어 | 정의 |
|---|---|
| **에셋 채널** | 본인이 등록해둔 트렌드 모니터링 대상 채널 (YT/TT/IG) |
| **폴더(카테고리)** | 채널을 묶는 단위 (예: `영드짜`, `해외영드짜`, `감동`). pint의 "추천 폴더" 대응 |
| **viralScore** | `영상 조회수 / 같은 채널 최근 20개 영상 평균 조회수` |
| **터진 영상** | 잘 터진 영상. 임계치 슬라이더로 본인이 조정 (기본: score ≥ 3 AND views ≥ 50K) |
| **심정지 영상** | 극단적으로 터진 영상. 사용자 표현 (기본: score ≥ 7 AND views ≥ 300K) |

> "심정지"는 사용자 표현(=심장 멎을 만큼 미친 viral). pint의 `/alerts`("삭제정지"=광고정지/삭제 알림)와는 무관.

---

## 2. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 14 (App Router) + TypeScript | |
| ORM | Prisma | schema-first |
| DB | Supabase Postgres | 무료 500MB |
| UI | Tailwind + shadcn/ui | |
| 차트 | recharts | 스파크라인 |
| 스크래핑(TT/IG) | `apify-client` (Node SDK) | $1.5~1.7/1k results |
| 스크래핑(YT) | `googleapis` YouTube Data API v3 | 무료 10k/일/key |
| 인증(웹) | Supabase Auth + Google OAuth (이메일 화이트리스트) | 본인만 |
| 인증(API) | Bearer API Key | OpenClaw용 |
| Cron | Vercel Cron | 일 1회 수집 + PT 자정 quota 리셋 |
| 호스팅 | Vercel (무료) | `*.vercel.app` |

**총 운영비 예상**: 월 $0~5 (Apify TT만 약간)

---

## 3. 데이터 모델 (Prisma 초안)

```prisma
generator client { provider = "prisma-client-js" }
datasource db    { provider = "postgresql"; url = env("DATABASE_URL") }

enum Platform { YOUTUBE  TIKTOK  INSTAGRAM }

model Folder {
  id        String   @id @default(cuid())
  name      String   @unique
  sortOrder Int      @default(0)
  isSeeded  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  channels  Channel[]
}

model Channel {
  id            String    @id @default(cuid())
  platform      Platform
  externalId    String                          // YT: UCxxx / TT,IG: handle
  handle        String?                         // 표시용 @xxx
  displayName   String?
  thumbnailUrl  String?
  subscriberCount Int?
  totalViewCount BigInt?
  folderId      String
  folder        Folder    @relation(fields: [folderId], references: [id])
  videos        Video[]
  isActive      Boolean   @default(true)
  addedAt       DateTime  @default(now())
  lastScrapedAt DateTime?

  @@unique([platform, externalId])
}

model Video {
  id              String   @id @default(cuid())
  channelId       String
  channel         Channel  @relation(fields: [channelId], references: [id], onDelete: Cascade)
  platform        Platform
  externalId      String                        // 영상 ID
  url             String
  caption         String?
  thumbnailUrl    String?
  viewCount       BigInt   @default(0)
  likeCount       Int?
  commentCount    Int?
  shareCount      Int?
  durationSeconds Int?
  isShorts        Boolean?                      // YT: ≤60s 자동 판정
  publishedAt     DateTime
  fetchedAt       DateTime @default(now())
  viralScore      Float?                        // computed snapshot

  @@unique([platform, externalId])
  @@index([channelId, publishedAt])
  @@index([viralScore])
}

model YoutubeApiKey {
  id              String    @id @default(cuid())
  label           String
  apiKey          String    @unique
  isActive        Boolean   @default(true)
  dailyQuotaLimit Int       @default(10000)
  usedToday       Int       @default(0)
  lastUsedAt      DateTime?
  exhaustedAt     DateTime?
  resetAt         DateTime?
  failCount       Int       @default(0)
  lastError       String?
  createdAt       DateTime  @default(now())
}

model ScrapeRun {
  id          String   @id @default(cuid())
  channelId   String?
  platform    Platform
  status      String                            // RUNNING | OK | FAILED
  itemsCount  Int      @default(0)
  costUsd     Float?
  quotaUsed   Int?
  error       String?
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
}
```

---

## 4. 사이드바 / 라우팅

```
[핵심]
  / ............................. 홈 (요약)
  /hot-videos .................... 터진 영상
  /viral-alerts (=심정지) ........ 심정지 영상

[관리]
  /channels ...................... 에셋 채널 관리 (단일 통합)
  /folders ....................... 폴더 관리 (이름 변경/추가/삭제/정렬)
  /settings/youtube-keys ......... YT API 키 로테이션 관리

[기타]
  /settings ...................... 임계치, 수집 주기, 인증
  /login ......................... Google 로그인
```

영상 상세는 모달 또는 `/v/:platform/:id`.

---

## 5. UI 핵심 화면

### 5-1. `/channels` 에셋 채널 관리 (통합)
```
[검색]  [+ 폴더 추가] [+ 채널 추가] [CSV 임포트]
─────────────────────────────────────────
▼ 영드짜 (12)                  [편집] [삭제]
   🎬 YT @건봉이티비   62K subs  72개영상
   🎬 YT @야그쟁이     34K       45
   🎵 TT @ydb_compile  12K       89
   📷 IG @movie_kr      8K       33
▼ 해외영드짜 (5)
▼ 감동 (8)
```

- 폴더 = 모든 플랫폼 채널을 한 곳에 담음
- 한 폴더 안에 YT/TT/IG 섞여도 OK
- 드래그앤드롭으로 채널 폴더 이동, 폴더 정렬

### 5-2. 채널 추가 모달
```
플랫폼:   [▼ YouTube]
핸들/URL: [_______________________]
          예: @xxx 또는 풀 URL (자동 감지)
폴더:     [▼ 영드짜] [+ 새 폴더]
          [취소]            [추가]
```

URL 패턴 자동 감지:
- `youtube.com/@xxx` → YT
- `tiktok.com/@xxx` → TT
- `instagram.com/xxx` → IG

### 5-3. CSV 임포트 양식
```csv
platform,handle,folder
youtube,@건봉이티비,영드짜
tiktok,@ydb_compile,영드짜
instagram,movie_clips_kr,영드짜
```

### 5-4. `/hot-videos`, `/viral-alerts`
영상 그리드 (썸네일 + 채널·폴더 배지 + 조회수 + score):
- 필터: 폴더(다중), 플랫폼(YT/TT/IG/ALL), 기간(24h/7d/30d/all), 형식(YT: shorts/long)
- 정렬: viralScore / views / publishedAt
- 임계치 슬라이더: minScore, minViews (실시간 결과 갱신)
- 프리셋 저장 (이름붙여 저장, 가져오기/내보내기)

### 5-5. `/folders` 폴더 관리
```
⋮⋮ 영드짜          (12) [✏][🗑]
⋮⋮ 해외영드짜      (5)  [✏][🗑]
[+ 새 폴더]    [기본 19개 시드 다시 불러오기]
```

폴더 삭제 시 다이얼로그: 다른 폴더로 이동 / 채널 함께 삭제 / 취소.

### 5-6. `/settings/youtube-keys`
```
✅ 메인1   AIza***XYZ   3,200 / 10,000  활성
✅ 메인2   AIza***ABC     800 / 10,000  활성
⚠️ 메인3   AIza***DEF  10,000 / 10,000  고갈 (리셋 17:00)
합계: 14,000 / 30,000
[+ 키 추가]
```

---

## 6. 폴더 시드 (19개)

`data/pint-categories.json` 의 `contentTemplates` 그대로 시드:

```
영드짜, 해외 영드짜, 예능짜집기, 인스타 틱톡 짜집기, 잡학상식,
국뽕, 블랙박스, 해짜 (동물), 해짜 | 정보, 게임 | 롤,
고래, 아이돌 팬튜브, 감동, 대기업, 스포츠 | 커뮤,
아기, 애니 | 짤형, 요리, 커뮤형
```

**이름 자유 편집·삭제·추가 가능.** 시드는 첫 실행 1회 자동 적용. `/folders`에서 "기본 시드 다시 불러오기"로 누락분만 재추가(기존 유지).

> `data/pint-categories.json` 의 `formatCategories`(9개 — 직촬/짜집기/하이라이트 등)는 향후 영상 단위 보조 라벨로 활용 가능. MVP에선 미사용.

---

## 7. YouTube API 키 로테이션

### 원리
- Google Cloud 프로젝트 1개 = API 키 1개 = 일일 10,000 quota
- 프로젝트 N개 → quota N배
- quota 소진 응답(`403 quotaExceeded`) → 다음 키
- PT 자정(KST 17시) 자동 리셋

### KeyManager 동작
```
getActiveKey()  → 활성 + 미고갈, usedToday 적은 순 1개 픽
markUsed(key, units) → DB usedToday += units
markExhausted(key) → exhaustedAt = now, resetAt = nextPTMidnight
```

### 호출 wrapper
```ts
async function callYoutube<T>(fn, units): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const apiKey = await keyManager.getActiveKey()
    const yt = google.youtube({ version: 'v3', auth: apiKey })
    try {
      const r = await fn(yt)
      await keyManager.markUsed(apiKey, units)
      return r
    } catch (err) {
      if (err.errors?.[0]?.reason in ['quotaExceeded','dailyLimitExceeded']) {
        await keyManager.markExhausted(apiKey)
        continue
      }
      throw err
    }
  }
  throw new Error('ALL_KEYS_EXHAUSTED')
}
```

### 작업별 quota cost
```
playlistItems.list   1
videos.list          1   (id 50개 batch)
channels.list        1
search.list          100  (사용 X — 비쌈)
```

### 채널 1개 수집 시 cost
- uploads playlist 1회 = 1
- 영상 통계 batch 1~2회 = 1~2
- → 약 **2~3 units / 채널**

50채널 × 3 = 150 units / run. 일일 10,000 → run 60회 가능. 키 1개로도 충분.

### 자동 리셋
```
vercel.json:
"crons": [
  { "path": "/api/cron/reset-youtube-quotas", "schedule": "5 8 * * *" }
]
```
UTC 8:05 = PT 0:05 = KST 17:05.

---

## 8. 데이터 수집

### 분기
```ts
async function scrapeChannel(c: Channel) {
  switch (c.platform) {
    case 'TIKTOK':    return scrapeApifyTiktok(c)    // clockworks/tiktok-scraper
    case 'INSTAGRAM': return scrapeApifyInstagram(c) // apify/instagram-scraper
    case 'YOUTUBE':   return scrapeYoutubeAPI(c)
  }
}
```

### Apify Actor 설정
- TikTok: `clockworks/tiktok-scraper`, 입력: `profiles: ['@xxx']`, `resultsPerPage: 30`, `profileSorting: 'latest'`
- Instagram: `apify/instagram-scraper`, 입력: `username: ['xxx']`, `resultsType: 'posts'`, `resultsLimit: 30`

### YouTube
1. (최초) `channels.list?forHandle=@xxx` → channelId 매핑 (1 quota)
2. uploads playlist ID = `UU` + channelId.slice(2)
3. `playlistItems.list` 50개 (1 quota)
4. `videos.list?id=batch50` 통계 (1 quota per batch)
5. Shorts 판정: ISO duration 파싱 → ≤60s

### 수집 주기 (MVP)
- 수동 트리거 우선: 채널 디테일 페이지 "지금 수집" 버튼
- 자동: Vercel Cron 일 1회 (UTC 18:00 = KST 03:00)
- 부분 수집: 채널 단위 Run, 마지막 fetch 이후 신규만

### viralScore 계산
영상 저장 후 batch 작업으로 일괄 갱신:
```ts
const channelAvg = avg(channel.recentVideos.slice(0, 20).viewCount)
video.viralScore = video.viewCount / channelAvg
```

---

## 9. OpenClaw API 노출

### 인증
```
Authorization: Bearer ${OPENCLAW_API_KEY}
```
`.env`에 `OPENCLAW_API_KEY` 두고 단순 매칭.

### REST 엔드포인트
```
GET    /api/v1/health
GET    /api/v1/stats
GET    /api/v1/folders
POST   /api/v1/folders
PATCH  /api/v1/folders/:id
DELETE /api/v1/folders/:id?moveTo=otherId
GET    /api/v1/channels?folderId&platform
POST   /api/v1/channels
PATCH  /api/v1/channels/:id
DELETE /api/v1/channels/:id
GET    /api/v1/videos?folderId&platform&period&sortBy&minScore&minViews&cursor&limit
POST   /api/v1/scrape/channel/:id
POST   /api/v1/scrape/all
GET    /api/v1/scrape/runs
```

### 응답 포맷
```json
{ "success": true, "data": {...}, "meta": {...} }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

### OpenAPI 노출
`/api/v1/openapi.json` 자동 생성 (zod-to-openapi 또는 수동).

### OpenClaw 스킬 매니페스트
레포 루트 `openclaw/skill.yaml`:
```yaml
name: trend-finder
description: TikTok/Instagram/YouTube 에셋 채널 트렌드 영상 검색·관리
baseUrl: https://your-app.vercel.app/api/v1
auth: { type: bearer, envVar: TREND_FINDER_API_KEY }
tools:
  - { name: list_videos,   method: GET,  path: /videos }
  - { name: list_channels, method: GET,  path: /channels }
  - { name: list_folders,  method: GET,  path: /folders }
  - { name: add_channel,   method: POST, path: /channels }
  - { name: scrape_channel,method: POST, path: /scrape/channel/{id} }
```

`openclaw/SOUL.md`에 자연어 사용 패턴 예시 기록.

### MCP 서버 (선택)
`/api/mcp` 엔드포인트로 같은 도구를 MCP 프로토콜로도 노출.

---

## 10. 인증 (웹)

Supabase Auth + Google OAuth. 본인 이메일 화이트리스트:
```ts
// middleware.ts
if (!user || user.email !== process.env.OWNER_EMAIL) redirect('/login')
```
다른 사람 가입해도 들어올 수 없음.

세션은 쿠키 → 디바이스 어디서 들어와도 데이터 동일 (Supabase 단일 DB).

---

## 11. 환경변수

```env
# DB
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...     # Prisma migration용

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# 인증 화이트리스트
OWNER_EMAIL=your@gmail.com

# Apify
APIFY_API_TOKEN=...

# OpenClaw API 인증
OPENCLAW_API_KEY=                # 본인이 무작위 생성

# (YouTube 키는 DB에서 관리. env 불필요)
```

---

## 12. 첫 PR 범위 (스캐폴딩)

목표: **DB · UI 더미 · 시드 · 모듈 뼈대까지**. 실데이터 연결은 다음 PR.

1. `npx create-next-app@latest --typescript --tailwind --app .`
2. `pnpm add prisma @prisma/client zod`, dev: `prisma`, `tsx`
3. shadcn/ui init: `npx shadcn@latest init`
4. `prisma/schema.prisma` (위 4번 모델 그대로)
5. `prisma/seed.ts` — `data/pint-categories.json` 로드, Folder upsert (isSeeded=true)
6. `lib/db.ts`, `lib/youtube/keyManager.ts` (스텁), `lib/scraper/{youtube,apify}.ts` (스텁)
7. App 라우팅 — 5번 절 페이지들 더미 컴포넌트
8. shadcn 컴포넌트 추가: button, dialog, input, select, dropdown, tabs, table, sonner
9. `app/api/v1/{folders,channels,videos}/route.ts` — mock 데이터 반환
10. `openclaw/skill.yaml`, `openclaw/SOUL.md` 매니페스트
11. `vercel.json` cron 정의
12. `README.md` — 셋업/배포 절차

이 범위로 첫 커밋·푸시 → 가입 끝나는 대로 `.env` 채우고 실연결.

---

## 13. 가입 체크리스트

- [ ] **Supabase** (https://supabase.com) — GitHub 로그인, 새 프로젝트(서울 리전), Database connection string 확보
- [ ] **Apify** (https://apify.com) — 가입 후 Settings → Integrations → Personal API tokens
- [ ] **Google Cloud × N** (https://console.cloud.google.com) — 프로젝트 생성 → YouTube Data API v3 활성화 → API 키 발급. 추후 `/settings/youtube-keys` 에서 N개 등록
- [ ] **Vercel** (https://vercel.com) — GitHub 연결만. 프로젝트 import는 코드 푸시 후

---

## 14. 비용 추정 (월 단위, 본인용)

| 항목 | 비용 |
|---|---|
| Vercel Hobby | $0 |
| Supabase Free | $0 |
| YouTube API (키 N개로 무한 확장) | $0 |
| Apify TikTok 스크래핑 (20채널 일1회 신규만) | ~$3 |
| Apify Instagram (월 $5 무료크레딧 내) | $0 |
| **합계** | **~$3** |

수집 주기 6h로 빡세게 돌리면 ~$10/월. 스타트는 일1회로 시작.

---

## 15. 차후(Phase 2+) 후보

- 영상 시계열 조회수 추적 → "Revival(부활) 영상" 감지 (pint 차용)
- 썸네일 임베딩 → 비슷한 영상 찾기
- viralScore 임계치 자동 튜닝 (백분위 기반)
- 키워드/캡션 검색
- "삭제정지" 알림 (영상 사라짐/광고정지 감지) — pint `/alerts` 차용
- formatCategories(9개) 영상 단위 자동/수동 라벨링
- 다중 사용자 지원 (현재는 본인 단일)

---

## 16. Pint 차용 정리

차용한 컨셉:
- ✅ 폴더 시스템 (`/watchlist/v2`)
- ✅ 콘텐츠 형식 / 시간 윈도우 필터
- ✅ 카테고리 19개 (`recommendedTemplate*` 추출)
- ✅ 9개 형식 라벨 (`/api/categories` 추출)
- ✅ 채널 카드 데이터 (구독자/조회수/spark)
- ✅ "터진 영상" 페이지 분리 (`/hot-videos`)
- ✅ 정렬·필터 패턴 (구독자/일일조회/참여율/주간업로드/생성일)
- ✅ 프리셋 저장·임포트·익스포트

차용 안 한 것:
- 익명/공개 랭킹 (본인 폴더만 보면 됨)
- 결제(Pro 플랜)
- 다중 사용자 OAuth

플랫폼 확장:
- pint = YouTube only
- 우리 = YT + TT + IG (단일 폴더에 통합)

---

## 17. 다음 세션 진입 멘트

집에서 새 Claude 세션 열고 다음 한 줄로 이어가면 됨:

> "SPEC.md 읽고 12절 첫 PR 스캐폴딩 진행해. 가입 진행 상황 알려줄게."

또는 가입 완료 상태에서:

> "SPEC.md 기반으로 Next.js 스캐폴딩 + Prisma 마이그레이션 + 시드까지 한번에 만들어줘. 환경변수는 [Supabase URL], [Apify 토큰] 이거 써."
