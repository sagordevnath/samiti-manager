import { z } from 'zod';

/** Locale codes used across web + API error messages. */
export const LOCALES = ['bn', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'bn';

/** Fixed display timezone (Bangladesh has no DST). Dates stored as UTC. */
export const DISPLAY_TIMEZONE = 'Asia/Dhaka' as const;

/** ── Common field primitives ─────────────────────────────────────────────── */
export const uuidSchema = z.string().uuid('অবৈধ আইডি / Invalid ID');
export const emailSchema = z.string().email('অবৈধ ইমেইল / Invalid email').toLowerCase();
export const phoneBdSchema = z
  .string()
  .regex(/^01[3-9]\d{8}$/, 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX) / Enter a valid BD mobile number');

/** Money is transmitted as string to avoid float errors; numeric(14,2) in DB. */
export const moneySchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'টাকার পরিমাণ সঠিক নয় / Invalid amount');

/** ── Auth ────────────────────────────────────────────────────────────────── */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষর / Password must be at least 8 characters'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** ── Members ─────────────────────────────────────────────────────────────── */
export const memberCreateSchema = z.object({
  fullName: z.string().trim().min(3, 'নাম কমপক্ষে ৩ অক্ষর / Name must be at least 3 characters').max(120),
  phone: phoneBdSchema,
  branchId: uuidSchema,
  samityName: z.string().trim().min(2).max(80).optional(),
  nationalId: z.string().trim().regex(/^\d{10}$|^\d{13}$|^\d{17}$/, 'এনআইডি ১০, ১৩ বা ১৭ সংখ্যার হতে হবে / NID must be 10, 13 or 17 digits').optional(),
});
export type MemberCreateInput = z.infer<typeof memberCreateSchema>;

/** ── Pagination envelope ─────────────────────────────────────────────────── */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** ── API error contract ──────────────────────────────────────────────────── */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
  // ── Collection & settlement domain codes ──
  'BACKDATED',
  'FUTURE_DATED',
  'ALREADY_CLOSED',
  'ALREADY_PAID',
  'ALREADY_REQUESTED',
  'ALREADY_RESCHEDULED',
  'ALREADY_REVERSED',
  'ALREADY_DECIDED',
  'INVALID_STATUS',
  // ── Accounting domain codes ──
  'NOT_CHECKED',
  'MAPPING_INACTIVE',
  'DAY_LOCKED',
  'PETTY_LIMIT',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}
