import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  /** Bangla (false) or ASCII (true) digits everywhere numbers are shown. */
  asciiDigits: boolean;
  toggleDigits: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

/** UI preferences: Bangla/ASCII digit toggle and mobile sidebar state. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      asciiDigits: false,
      toggleDigits: () => set((s) => ({ asciiDigits: !s.asciiDigits })),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    { name: 'samity-ui' },
  ),
);
