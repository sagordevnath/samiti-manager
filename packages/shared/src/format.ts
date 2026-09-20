import { DISPLAY_TIMEZONE } from './schemas.js';

const BANGLA_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

/** Convert ASCII digits in a string to Bangla digits (e.g. "1,250.50" → "১,২৫০.৫০"). */
export function toBanglaDigits(value: string): string {
  return value.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)]!);
}

/** Convert Bangla digits back to ASCII (useful for form inputs). */
export function toAsciiDigits(value: string): string {
  const digits: readonly string[] = BANGLA_DIGITS;
  return value.replace(/[০-৯]/g, (d) => String(digits.indexOf(d)));
}

/**
 * Format a number for display with the given digits.
 * Uses Intl (Intl.DisplayNames not needed); group separator is BN-specific via locale.
 */
export function formatNumber(value: number, locale: 'bn' | 'en'): string {
  const s = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD').format(value);
  return s;
}

/** Format a numeric(14,2) money string with the BDT symbol and locale digits. */
export function formatMoney(bdt: string, locale: 'bn' | 'en'): string {
  const n = Number(bdt);
  const formatted = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
  return `৳ ${formatted}`;
}

/**
 * Format a UTC timestamp (ISO string or Date) in Asia/Dhaka.
 * Storage is UTC; presentation is always Dhaka.
 */
export function formatDateTimeUtc(value: string | Date, locale: 'bn' | 'en'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    timeZone: DISPLAY_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/** Same as formatDateTimeUtc but date-only. */
export function formatDateUtc(value: string | Date, locale: 'bn' | 'en'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    timeZone: DISPLAY_TIMEZONE,
    dateStyle: 'medium',
  }).format(date);
}
