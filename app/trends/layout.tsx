import './ms.css';
import { MsSidebar } from './sidebar';

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-hidden" style={{ background: 'var(--ms-bg-base, #f5f7fb)' }}>
      <MsSidebar />
      <main className="ml-0 lg:ml-60 h-[100dvh] flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3 sm:p-6 min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
}
