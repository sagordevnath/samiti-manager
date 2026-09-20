import { beforeAll, describe, expect, it } from 'vitest';
import i18n from './i18n';

describe('i18n', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('bn');
  });

  it('defaults to Bangla', () => {
    expect(i18n.language.startsWith('bn')).toBe(true);
    expect(i18n.t('app.name')).toBe('স্যামিটি ম্যানেজার');
  });

  it('switches to English', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('nav.members')).toBe('Members');
    await i18n.changeLanguage('bn');
    expect(i18n.t('nav.members')).toBe('সদস্য');
  });
});
