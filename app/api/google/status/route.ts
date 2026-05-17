import { NextResponse } from 'next/server';
import { getStatus, disconnect } from '@/lib/google/oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, data: await getStatus() });
}

export async function DELETE() {
  await disconnect();
  return NextResponse.json({ success: true });
}
