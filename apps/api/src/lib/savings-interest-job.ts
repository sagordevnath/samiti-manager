import { supabaseAdmin } from './supabase.js';
import { env } from '../env.js';
import { logger } from './logger.js';

function dhakaDateParts(now = new Date()) {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return formatted.split('-').map(Number);
}

function periodFor(now = new Date()) {
  const [year, month] = dhakaDateParts(now);
  return env.SAVINGS_INTEREST_FREQUENCY === 'yearly' ? String(year) : `${year}-${String(month).padStart(2, '0')}`;
}

/** Runs once per day; the ledger's unique period key makes retries safe. */
export function startSavingsInterestJob(): void {
  let lastRunKey = '';
  const run = async () => {
    const now = new Date();
    const [year, month, day] = dhakaDateParts(now);
    const runKey = `${year}-${month}-${day}-${env.SAVINGS_INTEREST_FREQUENCY}`;
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    const period = periodFor(now);
    const { error: dormantError } = await supabaseAdmin.rpc('mark_dormant_savings_accounts');
    if (dormantError) logger.error({ err: dormantError }, 'scheduled dormant savings update failed');
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', weekday: 'short' }).format(now);
    if (weekday === 'Mon') {
      const weeklyReference = `Compulsory weekly ${year}-${month}-${day}`;
      const { data: weeklyAccounts, error: weeklyError } = await supabaseAdmin
        .from('savings_accounts')
        .select('id, savings_products(auto_link_weekly_amount, product_type, is_active)')
        .is('deleted_at', null)
        .in('status', ['active', 'dormant']);
      if (weeklyError) logger.error({ err: weeklyError }, 'weekly compulsory savings lookup failed');
      for (const account of weeklyAccounts ?? []) {
        const product = Array.isArray(account.savings_products) ? account.savings_products[0] : account.savings_products;
        const amount = Number(product?.auto_link_weekly_amount ?? 0);
        if (product?.is_active && product.product_type === 'compulsory' && amount > 0) {
          const { error: weeklyPostError } = await supabaseAdmin.rpc('post_savings_transaction', {
            p_account_id: account.id,
            p_transaction_type: 'deposit',
            p_amount: amount.toFixed(2),
            p_created_by: null,
            p_reference: weeklyReference,
            p_note: 'Compulsory weekly auto-link',
          });
          if (weeklyPostError && !String(weeklyPostError.message).includes('duplicate')) {
            logger.error({ err: weeklyPostError, accountId: account.id }, 'weekly compulsory savings posting failed');
          }
        }
        const interestDue = env.SAVINGS_INTEREST_FREQUENCY === 'monthly'
          ? day === 1
          : day === 1 && month === 1;
        if (!interestDue) return;
      }
    }
    const { data: accounts, error } = await supabaseAdmin
      .from('savings_accounts')
      .select('id, balance, savings_products(interest_rate, is_active)')
      .is('deleted_at', null)
      .in('status', ['active', 'dormant']);
    if (error) {
      logger.error({ err: error }, 'scheduled savings interest lookup failed');
      return;
    }
    const { data: posted, error: postedError } = await supabaseAdmin
      .from('savings_transactions')
      .select('account_id')
      .eq('transaction_type', 'interest')
      .eq('interest_period', period);
    if (postedError) {
      logger.error({ err: postedError }, 'scheduled savings interest duplicate check failed');
      return;
    }
    const postedIds = new Set((posted ?? []).map((row) => row.account_id));
    const divisor = env.SAVINGS_INTEREST_FREQUENCY === 'yearly' ? 100 : 1200;
    for (const account of accounts ?? []) {
      const product = Array.isArray(account.savings_products) ? account.savings_products[0] : account.savings_products;
      if (!product?.is_active || postedIds.has(account.id)) continue;
      const amount = (Number(account.balance) * Number(product.interest_rate) / divisor).toFixed(2);
      if (amount === '0.00') continue;
      const { error: postError } = await supabaseAdmin.rpc('post_savings_transaction', {
        p_account_id: account.id,
        p_transaction_type: 'interest',
        p_amount: amount,
        p_created_by: null,
        p_reference: `Scheduled interest ${period}`,
        p_note: `${env.SAVINGS_INTEREST_FREQUENCY} interest posting`,
        p_interest_period: period,
      });
      if (postError) logger.error({ err: postError, accountId: account.id }, 'scheduled savings interest posting failed');
    }
    logger.info({ period, frequency: env.SAVINGS_INTEREST_FREQUENCY }, 'scheduled savings interest run completed');
  };

  void run();
  setInterval(() => void run(), 24 * 60 * 60 * 1000);
}
