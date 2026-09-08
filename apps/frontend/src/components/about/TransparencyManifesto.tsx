import { RichText } from '@gitroom/frontend/components/legal/rich-text';

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import Link from 'next/link';
import { AuroraButton } from '@gitroom/frontend/components/ui/aurora-button';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';

export async function TransparencyManifesto() {
  const { t } = await getI18n();
  return (
    <section
      aria-labelledby="about-transparency-heading"
      className="w-full pb-20 sm:pb-24 max-w-[1100px] mx-auto px-6 md:px-8 text-center"
    >
      <Reveal>
        <h2
          id="about-transparency-heading"
          className="text-display-2 text-fg mb-6 max-w-[760px] mx-auto leading-[1.08] tracking-[-0.03em] text-balance"
        >
          {t("That's why D3 Creator exists.")}{' '}
        </h2>
        <p className="text-body-lg text-fgMuted max-w-[680px] mx-auto mb-8">
          {t(
            'Instead of showing screenshots or edited case studies, we made our creator ecosystem public. Followers, views, engagement, growth rankings, and live performance are displayed transparently across every platform we operate.'
          )}{' '}
        </p>
        <p className="text-body-lg text-fg max-w-[640px] mx-auto mb-10">
          <RichText
            text={t('In our culture, {emphasis1} speak louder than promises.')}
            values={{
              emphasis1: (
                <span className="text-brand font-medium">{t('numbers')}</span>
              ),
            }}
          />
        </p>
        <Link href="/leaderboard" className="contents">
          <AuroraButton variant="cta" size="lg">
            {t('See the live leaderboard')}{' '}
          </AuroraButton>
        </Link>
      </Reveal>
    </section>
  );
}
