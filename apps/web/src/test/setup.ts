import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18n from '@/lib/i18n';

// RTL auto-cleanup is disabled when vitest globals are off — do it explicitly.
afterEach(() => cleanup());

// Deterministic locale for component tests (jsdom has no navigator language).
void i18n.changeLanguage('bn');

// jsdom lacks matchMedia — stub it for the layout components.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom lacks scrollTo.
window.scrollTo = () => {};
