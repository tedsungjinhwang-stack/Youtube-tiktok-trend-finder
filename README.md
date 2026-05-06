# Trend Finder

본인 전용 TikTok / Instagram / YouTube 트렌드 영상 파인더.
에셋 채널을 폴더로 묶어 등록 → Apify(TT/IG)와 YouTube API로 수집 →
폴더·플랫폼·기간·임계치로 "터진 영상 / 심정지 영상" 식별.

전체 설계는 [SPEC.md](./SPEC.md) 참고.

---

## 현재 상태

**Phase 1 — Scaffolding (이 PR)**
- [x] Next.js 14 (App Router) + TypeScript + Tailwind
- [x] Prisma 스키마 (Folder / Channel / Video / YoutubeApiKey / ScrapeRun)
- [x] Seed (`data/pint-categories.json` → 19개 폴더)
- [x] App 라우팅 더미 페이지
- [x] API v1 mock 라우트 (`/api/v1/*`)
- [x] OpenClaw 매니페스트 (`openclaw/skill.yaml`, `SOUL.md`)
- [x] Vercel Cron 정의 (`vercel.json`)

**Phase 2 — 실연결 (다음 PR)**
- [ ] Supabase Auth (Google OAuth + 이메일 화이트리스트)
- [ ] YouTube API KeyManager 실 호출
- [ ] Apify 클라이언트 연동 (TT/IG)
- [ ] viralScore 계산 배치
- [ ] shadcn/ui 컴포넌트로 페이지 채우기

---

## 셋업

### 1) 의존성 설치
```bash
npm install
# 또는 pnpm install
```

### 2) 환경변수
```bash
cp .env.example .env
# DATABASE_URL, DIRECT_URL, NEXT_PUBLIC_SUPABASE_*, APIFY_API_TOKEN,
# OWNER_EMAIL, OPENCLAW_API_KEY, CRON_SECRET 채우기
```

### 3) DB 마이그레이션 + 시드
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 4) 개발 서버
```bash
npm run dev
# → http://localhost:3000
```

---

## 가입 체크리스트

- [ ] **Supabase** (https://supabase.com): 새 프로젝트(서울 리전), connection string 확보
- [ ] **Apify** (https://apify.com): Settings → Integrations → Personal API tokens
- [ ] **Google Cloud × N**: 프로젝트 N개 → YouTube Data API v3 활성화 → API 키 N개. `/settings/youtube-keys`에서 등록
- [ ] **Vercel** (https://vercel.com): GitHub 연결 후 import

---

## 배포 (Vercel)

1. GitHub 리포 push
2. Vercel에서 import → Framework = Next.js (자동 감지)
3. Environment Variables 등록 (`.env.example`의 모든 키)
4. 첫 배포 후 Settings → Cron Jobs 에서 `/api/cron/*` 활성화 확인
5. `/api/v1/health`로 헬스체크

---

## API

- Web (사용자): `/`, `/hot-videos`, `/viral-alerts`, `/channels`, `/folders`, `/settings/*`
- REST: `/api/v1/*` (Bearer `OPENCLAW_API_KEY`)
- OpenAPI: `GET /api/v1/openapi.json`
- OpenClaw 스킬: `openclaw/skill.yaml`

### 빠른 테스트
```bash
curl http://localhost:3000/api/v1/health
curl -H "Authorization: Bearer $OPENCLAW_API_KEY" \
     http://localhost:3000/api/v1/folders
```

---

## 프로젝트 구조

```
app/
  (pages)/        홈, hot-videos, viral-alerts, channels, folders, settings, login
  api/v1/         REST API (Bearer auth)
  api/cron/       Vercel Cron 핸들러
components/
  sidebar.tsx     좌측 네비
  ui/             shadcn 컴포넌트 (Phase 2 채움)
lib/
  db.ts           Prisma 싱글톤
  auth.ts         Bearer/Cron 인증
  youtube/keyManager.ts   YT API 키 로테이션
  scraper/        index/youtube/apify
prisma/
  schema.prisma   DB 모델
  seed.ts         pint-categories.json → Folder upsert
openclaw/
  skill.yaml      OpenClaw 스킬 매니페스트
  SOUL.md         자연어 사용 패턴
data/
  pint-categories.json    19개 시드 + 9개 형식 라벨
```

---

## 비용 예상

| 항목 | 월 |
|---|---|
| Vercel Hobby | $0 |
| Supabase Free | $0 |
| YouTube API (키 N개) | $0 |
| Apify TikTok 일1회 신규 | ~$3 |
| Apify Instagram (월 $5 무료) | $0 |
| **합계** | **~$3** |
