import { ImageResponse } from 'next/og';
import { createElement } from 'react';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    createElement(
      'div',
      {
        style: {
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
        },
      },
      'TF'
    ),
    { width: 512, height: 512 }
  );
}
