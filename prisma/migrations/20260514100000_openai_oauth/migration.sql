-- OpenAI OAuth 토큰 저장 (Codex CLI 방식 우회)

CREATE TABLE IF NOT EXISTS "OpenAIOAuth" (
  "id"           TEXT PRIMARY KEY DEFAULT 'default',
  "accessToken"  TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "accountEmail" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
