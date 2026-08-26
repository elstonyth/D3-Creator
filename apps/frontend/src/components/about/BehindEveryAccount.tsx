import { Reveal } from '@gitroom/frontend/components/ui/reveal';

export function BehindEveryAccount() {
  return (
    <section
      aria-labelledby="about-behind-heading"
      className="w-full pb-20 sm:pb-24 max-w-[1100px] mx-auto"
    >
      <h2 id="about-behind-heading" className="sr-only">
        Behind every account
      </h2>
      <div className="flex flex-col gap-4 max-w-[820px] mx-auto">
        <Reveal>
          <p className="text-body-lg text-fgMuted">Some started from zero.</p>
        </Reveal>
        <Reveal delay={100}>
          <p className="text-body-lg text-fgMuted pl-0 sm:pl-12">
            Some came from traditional industries.
          </p>
        </Reveal>
        <Reveal delay={200}>
          <p className="text-body-lg text-fgMuted pl-0 sm:pl-24">
            Some had never spoken on camera before.
          </p>
        </Reveal>
        <Reveal delay={300}>
          <p className="text-display-2 text-fg mt-8 tracking-[-0.03em] leading-[1.08]">
            But all of them chose to{' '}
            <span className="text-brand">build</span> instead of staying
            invisible.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
