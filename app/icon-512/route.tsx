import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0a0a0a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f5f5f5',
          fontSize: 300,
          fontWeight: 800,
          letterSpacing: '-0.05em',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        TF
      </div>
    ),
    size
  );
}
