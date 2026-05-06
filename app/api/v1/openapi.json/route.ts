import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SPEC = {
  openapi: '3.1.0',
  info: {
    title: 'Trend Finder API',
    version: '0.1.0',
    description:
      'TikTok / Instagram / YouTube 에셋 채널 트렌드 영상 검색 · 관리 API. Bearer auth via OPENCLAW_API_KEY.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: { summary: 'Health check', security: [], responses: { '200': { description: 'OK' } } },
    },
    '/stats': { get: { summary: 'Aggregate counts', responses: { '200': { description: 'OK' } } } },
    '/folders': {
      get: { summary: 'List folders', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Create folder', responses: { '201': { description: 'Created' } } },
    },
    '/folders/{id}': {
      patch: { summary: 'Update folder', responses: { '200': { description: 'OK' } } },
      delete: { summary: 'Delete folder', responses: { '200': { description: 'OK' } } },
    },
    '/channels': {
      get: { summary: 'List channels', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Add channel', responses: { '201': { description: 'Created' } } },
    },
    '/channels/{id}': {
      patch: { summary: 'Update channel', responses: { '200': { description: 'OK' } } },
      delete: { summary: 'Delete channel', responses: { '200': { description: 'OK' } } },
    },
    '/videos': {
      get: { summary: 'List videos with filters', responses: { '200': { description: 'OK' } } },
    },
    '/scrape/channel/{id}': {
      post: { summary: 'Scrape one channel', responses: { '200': { description: 'OK' } } },
    },
    '/scrape/all': {
      post: { summary: 'Scrape all active channels', responses: { '200': { description: 'OK' } } },
    },
    '/scrape/runs': {
      get: { summary: 'Recent scrape runs', responses: { '200': { description: 'OK' } } },
    },
  },
};

export async function GET() {
  return NextResponse.json(SPEC);
}
