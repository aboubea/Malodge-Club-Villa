import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, SidebarContent } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '../../store/uiStore';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { mobileNavOpen, setMobileNavOpen } = useUIStore();
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, setMobileNavOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen, setMobileNavOpen]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas">
      <Sidebar />

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-50">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              className="absolute inset-y-0 left-0 w-[min(288px,86vw)] bg-surface border-r border-line shadow-pop"
              role="dialog"
              aria-label="Navigation"
            >
              <SidebarContent collapsed={false} mobile />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1480px] px-4 sm:px-6 lg:px-10 py-6 lg:py-9">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
