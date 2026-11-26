-- 대시보드 AI 채팅이 DB 를 읽을 때 쓰는 역할 — 읽기만, 비밀 표(API 키·OAuth 토큰·Todoist 토큰)는 권한 없음.
-- lib/agent/chat.ts 가 트랜잭션 안에서 SET LOCAL ROLE dashboard_agent_reader 로 바꿔 쿼리를 돌린다.
-- RLS 가 켜진 표가 많아 BYPASSRLS (앱의 postgres 와 같게). 새 표는 자동으로 열리지 않는다 — 필요하면 GRANT 를 더한다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_agent_reader') THEN
    CREATE ROLE dashboard_agent_reader NOLOGIN BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO dashboard_agent_reader;
GRANT SELECT ON
  "ArchivedChannel", "Channel", "ChannelAttachment", "ChannelMaterial", "DiscoveryPost", "Folder", "Hashtag",
  "KeywordVolume", "MyChannel", "PastHit", "PerfEntry", "PixiTemplate", "PlanNote", "RadarAlias", "RadarCandidate",
  "RadarHot", "RadarPerson", "RadarVideo", "RadarWork", "ScheduledVideo", "ScrapePreset", "ScrapeRun", "TrendCache",
  "TrendingSettings", "TrendingSnapshot", "Video"
TO dashboard_agent_reader;
GRANT dashboard_agent_reader TO postgres;
