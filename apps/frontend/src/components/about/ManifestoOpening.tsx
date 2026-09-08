import { RichText } from '@gitroom/frontend/components/legal/rich-text';

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { DottedSurface } from '@gitroom/frontend/components/reactbits/dotted-surface';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';

export async function ManifestoOpening() {
  const { t } = await getI18n();
  return (
    <DottedSurface>
      <section
        aria-labelledby="about-manifesto-heading"
        className="w-full pt-16 pb-20 sm:pt-24 sm:pb-28 lg:pt-32 lg:pb-36 max-w-[1100px] mx-auto px-6 md:px-8"
      >
        <Reveal>
          <p className="text-micro uppercase text-fgSubtle tracking-[0.35em] mb-6">
            {t('About D3')}{' '}
          </p>

          <h1
            id="about-manifesto-heading"
            className="text-[clamp(48px,8vw,112px)] leading-[0.98] tracking-[-0.04em] font-semibold text-fg max-w-[820px]"
          >
            <RichText
              text={t("It's not {emphasis1}.")}
              values={{
                emphasis1: <span className="text-brand">{t('talent')}</span>,
              }}
            />
          </h1>

          <p className="mt-6 text-body-lg text-fgMuted max-w-[520px] leading-relaxed">
            {t(
              "Most people don't fail at content because they aren't talented. They fail because nobody ever taught them how to turn attention into business."
            )}{' '}
          </p>
        </Reveal>
      </section>
    </DottedSurface>
  );
}
