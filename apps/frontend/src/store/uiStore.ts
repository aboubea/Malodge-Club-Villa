import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';
export type DisplayCurrency = 'MAD' | 'EUR';

interface UIState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  theme: ThemePreference;
  /** Currency every amount is shown in (converted at today's rate). */
  currency: DisplayCurrency;
  setCurrency: (currency: DisplayCurrency) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  /** The global search (Ctrl+K) is open. */
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  /** The "add" sheet of the phone tab bar is open. */
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      theme: 'light',
      currency: 'MAD',
      setCurrency: (currency) => set({ currency }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      setTheme: (theme) => set({ theme }),
      searchOpen: false,
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      addOpen: false,
      setAddOpen: (addOpen) => set({ addOpen }),
    }),
    {
      name: 'malodge-ui',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, theme: state.theme, currency: state.currency }),
    },
  ),
);
