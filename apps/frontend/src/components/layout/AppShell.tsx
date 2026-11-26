import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileTabBar } from './MobileTabBar';
import { TopBar } from './TopBar';
import { SectionTabs } from './SectionTabs';
import { CommandPalette } from './CommandPalette';
import { useUIStore } from '../../store/uiStore';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { mobileNavOpen, setMobileNavOpen } = useUIStore();
  const location = useLocation();

  // The phone sheets close whenever the page changes; Escape closes them too.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen, setMobileNavOpen]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <CommandPalette />
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {/* Room at the bottom on phones for the tab bar */}
          <div className="mx-auto w-full max-w-[1480px] px-4 sm:px-6 lg:px-10 pt-5 pb-28 lg:py-8">
            <SectionTabs />
            {children}
          </div>
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
