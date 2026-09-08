import { RichText } from '@gitroom/frontend/components/legal/rich-text';

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import Link from 'next/link';
import { AuroraButton } from '@gitroom/frontend/components/ui/aurora-button';
import { GlassCard } from '@gitroom/frontend/components/ui/glass-card';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';

export async function ClosingMission() {
  const { t } = await getI18n();
  return (
    <section
      aria-labelledby="about-mission-heading"
      className="w-full pb-24 max-w-[1100px] mx-auto px-6 md:px-8"
    >
      <Reveal>
        <GlassCard
          variant="base"
          padding="lg"
          radius="3xl"
          className="flex flex-col gap-8 sm:gap-10 sm:p-12 lg:p-16"
        >
          <p className="text-micro uppercase text-fgSubtle tracking-[0.35em]">
            {t('Our mission')}{' '}
          </p>

          <h2
            id="about-mission-heading"
            className="text-display-2 text-fg tracking-[-0.03em] leading-[1.04] max-w-[760px] text-balance"
          >
            <RichText
              text={t('More {emphasis1}. More {emphasis2}. More {emphasis3}.')}
              values={{
                emphasis1: <span className="text-brand">{t('creators')}</span>,
                emphasis2: <span className="text-brand">{t('founders')}</span>,
                emphasis3: (
                  <span className="text-brand">{t('businesses')}</span>
                ),
              }}
            />
          </h2>

          <p className="text-body-lg text-fgMuted max-w-[640px] leading-relaxed">
            {t(
              'Helping Malaysia use content to actually change lives — leads, sales, real commercial IP. D3 is both a creator growth ecosystem and an operating company built on that thesis.'
            )}{' '}
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
            <Link href="/dashboard" className="contents">
              <AuroraButton variant="cta" size="lg">
                {t('Open the dashboard')}{' '}
              </AuroraButton>
            </Link>
            <Link href="/leaderboard" className="contents">
              <AuroraButton variant="ghost" size="lg">
                {t('See the leaderboard')}{' '}
              </AuroraButton>
            </Link>
          </div>
        </GlassCard>
      </Reveal>
    </section>
  );
}
