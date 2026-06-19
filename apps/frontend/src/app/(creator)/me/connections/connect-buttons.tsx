// apps/frontend/src/app/(creator)/me/connections/connect-buttons.tsx
'use client';

import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';

const OPTIONS: Array<{ platform: PlatformKey; href: string; label: string }> = [
  {
    platform: 'instagram',
    href: '/api/oauth/meta/start',
    label: 'Connect Instagram',
  },
  {
    platform: 'facebook',
    href: '/api/oauth/meta/start',
    label: 'Connect Facebook',
  },
  {
    platform: 'tiktok',
    href: '/api/oauth/tiktok/start',
    label: 'Connect TikTok',
  },
];

export function ConnectButtons() {
  return (
    <div className="flex flex-col gap-3">
      {OPTIONS.map(({ platform, href, label }) => {
        const Icon = PLATFORM_ICONS[platform];
        return (
          <a
            key={label}
            href={href}
            className="flex items-center gap-3 glass-base border border-borderGlass rounded-xl px-4 py-3 text-body text-fg hover:border-aurora-cta transition-colors"
          >
            <span className="flex items-center justify-center size-8 rounded-full glass-subtle text-fgMuted">
              <Icon size={16} />
            </span>
            <span>{label}</span>
            <span className="ml-auto text-caption text-fgSubtle">
              {PLATFORM_LABELS[platform]}
            </span>
          </a>
        );
      })}
    </div>
  );
}
