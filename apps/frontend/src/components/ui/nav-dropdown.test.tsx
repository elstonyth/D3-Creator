/** @jest-environment jsdom */
/**
 * PRD 3 §3's keyboard table, exhaustively — §8 item 5 makes it a merge gate,
 * not a nicety — plus §5.3's viewer→href/lock mapping.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';

import NavDropdown, { type StudioViewer } from './nav-dropdown';

let pathname = '/dashboard';
jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ITEMS = [
  { href: '/classes', label: 'Classes' },
  { href: '/studio/analyzer', label: 'Video Analyzer' },
  { href: '/studio/chat', label: 'Script Coach' },
];

function setup(viewer: StudioViewer = 'member') {
  render(<NavDropdown label="Studio" items={ITEMS} viewer={viewer} />);
  const trigger = screen.getByRole('button', { name: /studio/i });
  const panel = screen.getByRole('menu', { hidden: true });
  const items = () =>
    within(panel).getAllByRole('menuitem', {
      hidden: true,
    }) as HTMLAnchorElement[];
  return { trigger, panel, items };
}

beforeEach(() => {
  pathname = '/dashboard';
});

describe('the trigger', () => {
  it('opens on CLICK, not hover, and reports state through aria-expanded', () => {
    const { trigger, panel } = setup();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(panel.className).toContain('invisible');

    fireEvent.mouseEnter(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.className).not.toContain('invisible');
  });

  it('is aria-wired to the panel it controls', () => {
    const { trigger, panel } = setup();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-label')).toBe('Studio');
  });

  it('turns yellow when ANY child route is active', () => {
    const first = setup();
    expect(first.trigger.className).toContain('text-fg-muted');
    first.panel.remove();

    pathname = '/studio/analyzer/3f2b6c40';
    render(<NavDropdown label="Studio" items={ITEMS} viewer="member" />);
    const triggers = screen.getAllByRole('button', { name: /studio/i });
    expect(triggers[triggers.length - 1].className).toContain(
      'text-brand',
    );
  });
});

describe('§3 keyboard table', () => {
  it('ArrowDown on a closed trigger opens and focuses the FIRST item', () => {
    const { trigger, items } = setup();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items()[0]);
  });

  it('ArrowUp on a closed trigger opens and focuses the LAST item', () => {
    const { trigger, items } = setup();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items()[2]);
  });

  it('ArrowDown wraps last → first, ArrowUp wraps first → last', () => {
    const { trigger, items } = setup();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(items()[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items()[1]);
    fireEvent.keyDown(items()[1], { key: 'ArrowDown' });
    fireEvent.keyDown(items()[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items()[0]);
    fireEvent.keyDown(items()[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items()[2]);
  });

  it('Home and End jump to the first and last item', () => {
    const { trigger, items } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(document.activeElement).toBe(items()[2]);
    fireEvent.keyDown(items()[2], { key: 'Home' });
    expect(document.activeElement).toBe(items()[0]);
  });

  it('Escape closes and returns focus to the trigger; it is a no-op when closed', () => {
    const { trigger, items } = setup();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(items()[0], { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('Space on an item follows the link — anchors activate on Enter alone', () => {
    const { trigger, items } = setup();
    fireEvent.click(trigger);
    const target = items()[1];
    const clicked = jest.fn();
    target.addEventListener('click', (e) => {
      e.preventDefault();
      clicked();
    });
    fireEvent.keyDown(target, { key: ' ' });
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('closes on focus-out, not on a Tab keydown', () => {
    const { trigger, panel } = setup();
    fireEvent.click(trigger);
    // A Tab keydown must NOT close: React would commit `invisible` before the
    // browser runs the default Tab and restart the sequence at the skip link.
    fireEvent.keyDown(trigger, { key: 'Tab' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.blur(panel, { relatedTarget: document.body });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('stays open when focus moves between the trigger and an item', () => {
    const { trigger, panel, items } = setup();
    fireEvent.click(trigger);
    fireEvent.blur(panel, { relatedTarget: items()[0] });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes when an item is picked', () => {
    const { trigger, items } = setup();
    fireEvent.click(trigger);
    fireEvent.click(items()[0]);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps only the trigger in the tab order — roving tabindex', () => {
    const { items } = setup();
    for (const item of items()) expect(item.getAttribute('tabindex')).toBe('-1');
  });
});

describe('§5.3 viewer mapping', () => {
  it('member: no lock, real hrefs', () => {
    const { items } = setup('member');
    expect(items().map((a) => a.getAttribute('href'))).toEqual([
      '/classes',
      '/studio/analyzer',
      '/studio/chat',
    ]);
    expect(screen.queryAllByText(/members only/)).toHaveLength(0);
  });

  it('signed-out: locked, and every href bounces through /login', () => {
    const { items } = setup('signed-out');
    expect(items().map((a) => a.getAttribute('href'))).toEqual([
      '/login?redirectTo=/classes',
      '/login?redirectTo=/studio/analyzer',
      '/login?redirectTo=/studio/chat',
    ]);
    // Both glyphs are aria-hidden; without this text a screen-reader user
    // hears three plain links and no signal that anything is gated.
    expect(screen.getAllByText(/members only/)).toHaveLength(3);
  });

  it('no-access: locked, but the hrefs stay real', () => {
    const { items } = setup('no-access');
    expect(items().map((a) => a.getAttribute('href'))).toEqual([
      '/classes',
      '/studio/analyzer',
      '/studio/chat',
    ]);
    expect(screen.getAllByText(/members only/)).toHaveLength(3);
  });

  it('aria-current comes from the item’s OWN route, never the /login rewrite', () => {
    pathname = '/classes';
    const { items } = setup('signed-out');
    expect(items()[0].getAttribute('aria-current')).toBe('page');
    expect(items()[0].getAttribute('href')).toBe('/login?redirectTo=/classes');
    expect(items()[1].getAttribute('aria-current')).toBeNull();
  });
});
