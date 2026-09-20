import { formatDateTimeUtc, formatMoney, toAsciiDigits, toBanglaDigits } from '@samity/shared';
import { useUiStore } from '@/stores/ui';

/** Convert digits according to the persisted user preference. */
export function applyDigitPreference(text: string, asciiDigits: boolean): string {
  return asciiDigits ? toAsciiDigits(text) : toBanglaDigits(text);
}

/** Money formatter honoring the digit toggle. */
export function useMoneyFormatter() {
  const asciiDigits = useUiStore((s) => s.asciiDigits);
  return (bdt: string) => applyDigitPreference(formatMoney(bdt, 'bn'), asciiDigits);
}

/** Date/time formatter honoring the digit toggle (always Asia/Dhaka). */
export function useDateTimeFormatter() {
  const asciiDigits = useUiStore((s) => s.asciiDigits);
  return (value: string | Date) => applyDigitPreference(formatDateTimeUtc(value, 'bn'), asciiDigits);
}
