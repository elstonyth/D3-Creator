/**
 * The page scrolls itself while a card is dragged near the top or bottom
 * edge — faster the closer it gets, never faster than a set step — so a
 * finger can carry a card down a long board on a phone.
 */

import { edgeScroll } from './use-drag';

it('scrolls near the edges only, faster closer in, up to a cap', () => {
  expect(edgeScroll(400, 800)).toBe(0);
  expect(edgeScroll(60, 800)).toBeLessThan(0);
  expect(edgeScroll(5, 800)).toBeLessThan(edgeScroll(60, 800));
  expect(edgeScroll(795, 800)).toBeGreaterThan(edgeScroll(740, 800));
  expect(edgeScroll(-500, 800)).toBe(-16);
  expect(edgeScroll(5000, 800)).toBe(16);
});
