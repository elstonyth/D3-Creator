/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { PlatformCards } from './platform-cards';
import type { PlatformCard } from '@gitroom/frontend/lib/creator-platform-breakdown';

test('renders owned + scraped cards with badge + correct drill-down link', () => {
  const cards: PlatformCard[] = [
    {
      platform: 'instagram',
      handle: 'mei_yeo2507',
      source: 'owned',
      followers: 9840,
      views: 24860,
    },
    {
      platform: 'douyin',
      handle: 'eytan',
      source: 'scraped',
      followers: 49600,
      views: 501000,
    },
  ];
  render(<PlatformCards cards={cards} />);
  expect(screen.getByText('✓ first-party')).toBeTruthy();
  expect(screen.getByText('Tracked')).toBeTruthy();
  expect(screen.getByText('@mei_yeo2507')).toBeTruthy();
  const link = screen.getByText('@mei_yeo2507').closest('a');
  expect(link?.getAttribute('href')).toBe('/creators/mei_yeo2507/instagram');
});

test('renders nothing when there are no cards', () => {
  const { container } = render(<PlatformCards cards={[]} />);
  expect(container.firstChild).toBeNull();
});
