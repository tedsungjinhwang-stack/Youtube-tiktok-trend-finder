import type { Metadata } from 'next';
import './globals.css';
import { TopBar } from '@/components/top-bar';

export const metadata: Metadata = {
  title: 'Trend Finder',
  description: 'TikTok / Instagram / YouTube 에셋 채널 트렌드 영상 파인더',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen antialiased">
        <TopBar />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </body>
    </html>
  );
}
