import {
  doneCounts,
  finishedBy,
  parseLink,
  parseVideoInput,
  posterOf,
  safeHref,
  videoStage,
  type Video,
} from './videos';

const ALI = 'aaaaaaaa-0000-4000-8000-000000000009';
const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ZU = 'aaaaaaaa-0000-4000-8000-000000000002';
const ACC = 'bbbbbbbb-0000-4000-8000-000000000001';

function video(patch: Partial<Video> = {}): Video {
  return {
    id: 'v1',
    creatorId: ACC,
    title: 'CNY reel',
    note: null,
    editorId: ALI,
    handlerId: KEE,
    editedAt: null,
    editedBy: null,
    editLink: null,
    postDate: null,
    postTime: null,
    postedAt: null,
    postedBy: null,
    postLink: null,
    createdAt: '2026-09-20T02:00:00+00:00',
    ...patch,
  };
}

describe('videoStage', () => {
  it('sits with the editor until the edit is done, then with the handler', () => {
    expect(videoStage(video())).toBe('editing');
    expect(videoStage(video({ editedAt: '2026-09-21T02:00:00Z' }))).toBe(
      'posting',
    );
    expect(
      videoStage(
        video({
          editedAt: '2026-09-21T02:00:00Z',
          postedAt: '2026-09-22T12:00:00Z',
        }),
      ),
    ).toBe('done');
  });

  it('goes straight to posting when nobody edits it', () => {
    expect(videoStage(video({ editorId: null }))).toBe('posting');
  });
});

describe('parseLink', () => {
  it('keeps web links and refuses everything else', () => {
    expect(parseLink('  https://drive.google.com/file/d/abc/view  ')).toBe(
      'https://drive.google.com/file/d/abc/view',
    );
    expect(parseLink('http://instagram.com/p/x')).toBe(
      'http://instagram.com/p/x',
    );
    expect(parseLink('')).toBeNull();
    expect(parseLink(null)).toBeNull();
    expect(parseLink('javascript:alert(1)')).toBeUndefined();
    expect(parseLink('drive.google.com/file')).toBeUndefined();
    expect(parseLink(`https://x.com/${'a'.repeat(500)}`)).toBeUndefined();
  });

  it('never renders a non-web link as a link', () => {
    expect(safeHref('https://tiktok.com/@a/video/1')).toBe(
      'https://tiktok.com/@a/video/1',
    );
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe('parseVideoInput', () => {
  it('tidies a new video job', () => {
    expect(
      parseVideoInput({
        creatorId: ACC,
        title: '  CNY   reel ',
        note: '',
        editorId: ALI,
        handlerId: '',
        postDate: '',
        postTime: '',
      }),
    ).toEqual({
      ok: true,
      value: {
        creatorId: ACC,
        title: 'CNY reel',
        note: null,
        editorId: ALI,
        handlerId: null,
        postDate: null,
        postTime: null,
      },
    });
  });

  it('refuses what the table would refuse, in words', () => {
    const ok = { creatorId: ACC, title: 'x', editorId: ALI, handlerId: KEE };
    expect(parseVideoInput({ ...ok, creatorId: '' })).toMatchObject({
      ok: false,
    });
    expect(parseVideoInput({ ...ok, title: ' ' })).toMatchObject({ ok: false });
    expect(parseVideoInput({ ...ok, editorId: 'x' })).toMatchObject({
      ok: false,
    });
    expect(parseVideoInput({ ...ok, postDate: '2026-02-30' })).toMatchObject({
      ok: false,
    });
    expect(parseVideoInput({ ...ok, postTime: '8pm' })).toMatchObject({
      ok: false,
    });
    expect(parseVideoInput({ ...ok, postTime: '20:00' })).toMatchObject({
      ok: false, // a time needs a day
    });
    expect(
      parseVideoInput({ ...ok, editorId: '', handlerId: '' }),
    ).toMatchObject({
      ok: false, // somebody has to do it
    });
  });
});

describe('doneCounts', () => {
  const from = '2026-09-01T00:00:00+08:00';
  const to = '2026-10-01T00:00:00+08:00';

  it('counts each Done in the month it was clicked, for whoever it was stamped with', () => {
    const edit = (at: string) => ({ editedAt: at, editedBy: ALI });
    const post = (at: string) => ({ postedAt: at, postedBy: KEE });
    const list = [
      video({
        id: 'a',
        ...edit('2026-09-05T02:00:00Z'),
        ...post('2026-09-06T02:00:00Z'),
      }),
      video({ id: 'b', ...edit('2026-09-30T17:00:00Z') }), // 1 Oct in Malaysia
      video({ id: 'c', ...edit('2026-08-31T15:59:00Z') }), // 31 Aug in Malaysia
      video({ id: 'd', editorId: null, ...post('2026-09-10T02:00:00Z') }),
    ];
    expect(doneCounts(list, ALI, from, to)).toEqual({ edited: 1, posted: 0 });
    expect(doneCounts(list, KEE, from, to)).toEqual({ edited: 0, posted: 2 });
  });

  it('keeps the credit where it was earned when the job changes hands', () => {
    // ALI finished the edit, then the admin gave the job to someone else.
    const moved = video({
      editorId: ZU,
      handlerId: ZU,
      editedAt: '2026-09-05T02:00:00Z',
      editedBy: ALI,
      postedAt: '2026-09-06T02:00:00Z',
      postedBy: KEE,
    });
    expect(finishedBy([moved], ALI, from, to).edited).toHaveLength(1);
    expect(finishedBy([moved], KEE, from, to).posted).toHaveLength(1);
    expect(doneCounts([moved], ZU, from, to)).toEqual({ edited: 0, posted: 0 });
  });
});

describe('posterOf', () => {
  it('is the handler, or the editor on a job with no handler', () => {
    expect(posterOf(video())).toBe(KEE);
    expect(posterOf(video({ handlerId: null }))).toBe(ALI);
    expect(posterOf(video({ handlerId: null, editorId: null }))).toBeNull();
  });
});
