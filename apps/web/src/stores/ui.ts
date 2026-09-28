import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'light' | 'dark' | 'system';

interface UiState {
  /** Bangla (false) or ASCII (true) digits everywhere numbers are shown. */
  asciiDigits: boolean;
  toggleDigits: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Color scheme preference; 'system' follows prefers-color-scheme. */
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

/** UI preferences: digits, mobile sidebar state, and color theme (persisted). */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      asciiDigits: false,
      toggleDigits: () => set((s) => ({ asciiDigits: !s.asciiDigits })),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'samity-ui' },
  ),
);
