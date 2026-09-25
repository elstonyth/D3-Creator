'use client';

import { useI18n } from './locale-provider';
import { parseLocale } from '@gitroom/frontend/lib/i18n';

/**
 * `zoomSafe`: 17px below `sm`, so iOS Safari does not zoom the page when the
 * menu is tapped (it zooms on any focused control under 16px), and a little
 * wider there so "English" still fits at that size. The public header keeps
 * the compact default because it is frozen (DESIGN.md §1).
 */
export function LanguageSwitcher({ zoomSafe = false }: { zoomSafe?: boolean }) {
  const { locale, changeLocale, pending, t } = useI18n();
  const [width, size] = zoomSafe
    ? ['max-w-[104px] sm:max-w-[88px]', 'text-body-lg sm:text-caption']
    : ['max-w-[88px]', 'text-caption'];
  return (
    <select
      aria-label={t('Interface language')}
      value={locale}
      disabled={pending}
      onChange={(event) => changeLocale(parseLocale(event.target.value))}
      className={`h-8 ${width} shrink-0 rounded-md border border-borderGlassStrong bg-canvas px-2 ${size} text-fg disabled:opacity-60`}
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
