import { Metadata } from 'next';
import { ManifestoOpening } from '@gitroom/frontend/components/about/ManifestoOpening';
import { StoryTimeline } from '@gitroom/frontend/components/about/StoryTimeline';
import { FivePillars } from '@gitroom/frontend/components/about/FivePillars';
import { TransparencyManifesto } from '@gitroom/frontend/components/about/TransparencyManifesto';
import { ClosingMission } from '@gitroom/frontend/components/about/ClosingMission';

export const revalidate = 3600;

export const metadata: Metadata = {
  title:
    'About D3 — A creator growth ecosystem and commercial IP operating company.',
  description:
    'D3 builds creators, founders, and commercial IPs across Malaysia. Not vanity. Not motivation. Real execution: content, audience, platform, positioning, monetization.',
  alternates: { canonical: '/about' },
};

// Each section owns its own <Section><Container>, so the transparency band can
// run full-bleed while every heading still lines up on the same left edge.
export default function AboutPage() {
  return (
    <article>
      <ManifestoOpening />
      <StoryTimeline />
      <FivePillars />
      <TransparencyManifesto />
      <ClosingMission />
    </article>
  );
}
