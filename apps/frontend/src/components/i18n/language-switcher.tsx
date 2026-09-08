'use client';

import { useI18n } from './locale-provider';
import { parseLocale } from '@gitroom/frontend/lib/i18n';

export function LanguageSwitcher() {
  const { locale, changeLocale, pending, t } = useI18n();
  return (
    <select
      aria-label={t('Interface language')}
      value={locale}
      disabled={pending}
      onChange={(event) => changeLocale(parseLocale(event.target.value))}
      className="h-8 max-w-[88px] shrink-0 rounded-md border border-borderGlassStrong bg-canvas px-2 text-caption text-fg disabled:opacity-60"
    >
      <option value="en" lang="en">
        English
      </option>
      <option value="zh" lang="zh-CN">
        中文
      </option>
    </select>
  );
}
