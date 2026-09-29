/**
 * What each push says: the pop-up's words (work-alerts.tsx), in the language
 * of the device it goes to.
 */

import { pushText, type PushEvent } from './push-words';
import type { Shoot } from './shoots';

const names = {
  person: (id: string) => ({ kee: 'KEE', mei: 'MEI' })[id] ?? '—',
  account: (id: string | null) => (id === 'acc' ? '卖烧肉的Lydia' : null),
};

const shoot = (over: Partial<Shoot> = {}): Shoot => ({
  id: 's1',
  memberId: 'kee',
  date: '2026-09-30',
  time: '10:00',
  title: null,
  creatorId: 'acc',
  videosShot: null,
  status: 'planned',
  note: null,
  movedReason: null,
  createdBy: null,
  updatedBy: null,
  ...over,
});

const TODAY = '2026-09-30';

it('tells an editor about videos passed to them', () => {
  const e: PushEvent = {
    kind: 'edit',
    to: 'mei',
    from: 'kee',
    titles: ['Reel 1', 'Reel 2'],
    creatorId: 'acc',
    ref: 'v1',
  };
  expect(pushText(e, 'en', names, TODAY)).toEqual({
    title: 'New videos to edit',
    body: 'Reel 1, Reel 2 · From KEE · 卖烧肉的Lydia',
    tag: 'edit:v1',
  });
  expect(pushText(e, 'zh', names, TODAY)).toEqual({
    title: '新的剪辑任务',
    body: 'Reel 1、Reel 2 · 来自 KEE · 卖烧肉的Lydia',
    tag: 'edit:v1',
  });
});

it('tells a handler a cut waits on their check', () => {
  const e: PushEvent = {
    kind: 'verify',
    to: 'kee',
    by: 'mei',
    title: 'Reel 1',
    creatorId: null,
    ref: 'v1',
  };
  expect(pushText(e, 'en', names, TODAY)).toEqual({
    title: 'Edited — ready for you to verify',
    body: 'Reel 1 · Cut by MEI',
    tag: 'verify:v1',
  });
  expect(pushText(e, 'zh', names, TODAY).body).toBe('Reel 1 · MEI 剪辑');
});

it('names a shoot by its day, time and title or account', () => {
  const due = (s: Shoot) =>
    pushText({ kind: 'due', to: 'kee', shoot: s }, 'en', names, TODAY);
  expect(due(shoot())).toEqual({
    title: 'Shoot time is up — pass the videos on',
    body: 'Today · 10:00 · 卖烧肉的Lydia',
    tag: 'due:s1',
  });
  expect(
    due(shoot({ date: '2026-10-01', time: null, title: 'Hotpot' })).body,
  ).toBe('Thu, Oct 1 · Hotpot');
  expect(due(shoot({ creatorId: null })).body).toBe('Today · 10:00 · Shoot');
  expect(
    pushText({ kind: 'due', to: 'kee', shoot: shoot() }, 'zh', names, TODAY)
      .title,
  ).toBe('拍摄时间到了——请交出视频');
});

it('tells a person about a shoot someone else added or changed', () => {
  const s = shoot({ movedReason: 'The client changed the time' });
  expect(
    pushText({ kind: 'new-shoot', to: 'kee', shoot: s }, 'en', names, TODAY),
  ).toEqual({
    title: 'New shoot scheduled for you',
    body: 'Today · 10:00 · 卖烧肉的Lydia',
    tag: 'shoot:s1',
  });
  expect(
    pushText(
      { kind: 'changed-shoot', to: 'kee', shoot: s },
      'en',
      names,
      TODAY,
    ),
  ).toEqual({
    title: 'Shoot changed for you',
    body: 'Today · 10:00 · 卖烧肉的Lydia · Changed: The client changed the time',
    tag: 'shoot:s1',
  });
  expect(
    pushText(
      {
        kind: 'changed-shoot',
        to: 'kee',
        shoot: shoot({ status: 'cancelled' }),
      },
      'zh',
      names,
      TODAY,
    ),
  ).toEqual({
    title: '你的拍摄有变动',
    body: '今天 · 10:00 · 卖烧肉的Lydia · 已取消',
    tag: 'shoot:s1',
  });
});
