import {
  doneCounts,
  finishedBy,
  mySection,
  parseLink,
  parsePassInput,
  parseVideoChange,
  PASS_REFUSALS,
  safeHref,
  videoPatch,
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
    shootId: null,
    title: 'CNY reel',
    editorId: ALI,
    handlerId: KEE,
    editedAt: null,
    editedBy: null,
    editLink: null,
    verifiedAt: null,
    verifiedBy: null,
    createdAt: '2026-09-20T02:00:00+00:00',
    ...patch,
  };
}

const EDITED = { editedAt: '2026-09-21T02:00:00Z', editedBy: ALI };
const VERIFIED = { verifiedAt: '2026-09-22T02:00:00Z', verifiedBy: KEE };

describe('videoStage', () => {
  it('sits with the editor until the edit is done, then with the handler', () => {
    expect(videoStage(video())).toBe('editing');
    expect(videoStage(video(EDITED))).toBe('verifying');
    expect(videoStage(video({ ...EDITED, ...VERIFIED }))).toBe('done');
  });
});

describe('mySection', () => {
  const month = '2026-09';

  it('puts each video on the list of whoever holds its next step', () => {
    const v = video();
    expect(mySection(v, ALI, month)).toBe('toEdit');
    expect(mySection(v, KEE, month)).toBe('withEditor');
    expect(mySection(v, ZU, month)).toBeNull();
    const cut = video(EDITED);
    expect(mySection(cut, KEE, month)).toBe('toVerify');
    // The editor's part is done; it counts toward their month.
    expect(mySection(cut, ALI, month)).toBe('done');
    const checked = video({ ...EDITED, ...VERIFIED });
    expect(mySection(checked, KEE, month)).toBe('done');
    expect(mySection(checked, ALI, month)).toBe('done');
  });

  it('shows a video once when one person is both hands', () => {
    const own = video({ editorId: KEE, handlerId: KEE });
    expect(mySection(own, KEE, month)).toBe('toEdit');
    const cut = { ...own, editedAt: EDITED.editedAt, editedBy: KEE };
    expect(mySection(cut, KEE, month)).toBe('toVerify');
  });

  it('keeps only this month under done', () => {
    // 31 Aug in Malaysia: last month's edit, still not verified.
    const old = video({ editedAt: '2026-08-31T15:00:00Z', editedBy: ALI });
    expect(mySection(old, ALI, month)).toBeNull();
    expect(mySection(old, KEE, month)).toBe('toVerify');
  });
});

describe('parsePassInput', () => {
  it('tidies each row', () => {
    expect(
      parsePassInput([
        { title: '  Reel   1 ', editorId: ALI },
        { title: 'Reel 2', editorId: KEE },
      ]),
    ).toEqual({
      ok: true,
      value: [
        { title: 'Reel 1', editorId: ALI },
        { title: 'Reel 2', editorId: KEE },
      ],
    });
  });

  it('takes 1 to 30 rows', () => {
    const row = { title: 'Reel', editorId: ALI };
    expect(parsePassInput([])).toEqual({
      ok: false,
      message: PASS_REFUSALS.count,
    });
    expect(parsePassInput(Array(30).fill(row))).toMatchObject({ ok: true });
    expect(parsePassInput(Array(31).fill(row))).toEqual({
      ok: false,
      message: PASS_REFUSALS.count,
    });
    expect(parsePassInput(null)).toMatchObject({ ok: false });
    expect(parsePassInput(row)).toMatchObject({ ok: false });
  });

  it('refuses a row with no title or no editor, in words', () => {
    expect(parsePassInput([{ title: '  ', editorId: ALI }])).toEqual({
      ok: false,
      message: PASS_REFUSALS.title,
    });
    const long = { title: 'x'.repeat(201), editorId: ALI };
    expect(parsePassInput([long])).toEqual({
      ok: false,
      message: PASS_REFUSALS.title,
    });
    expect(parsePassInput([{ title: 'Reel', editorId: '' }])).toEqual({
      ok: false,
      message: PASS_REFUSALS.editor,
    });
    expect(parsePassInput(['Reel'])).toMatchObject({ ok: false });
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

  it('takes the link out of pasted share text', () => {
    expect(
      parseLink(
        '7.43 复制打开抖音，看看【作品】https://v.douyin.com/iRNBho6H/ 再次打开',
      ),
    ).toBe('https://v.douyin.com/iRNBho6H/');
    expect(
      parseLink('看看这篇笔记 http://xhslink.com/a/AbCdE，复制本条信息'),
    ).toBe('http://xhslink.com/a/AbCdE');
    expect(parseLink('see https://example.com/p/1).')).toBe(
      'https://example.com/p/1',
    );
    expect(parseLink('no link here')).toBeUndefined();
    expect(parseLink('javascript:alert(1) https://ok.com')).toBe(
      'https://ok.com',
    );
    expect(safeHref('看看 https://v.douyin.com/x/')).toBeNull();
  });

  it('refuses an extracted link over 500 characters', () => {
    expect(
      parseLink(`看看 https://x.com/${'a'.repeat(490)} 再次打开`),
    ).toBeUndefined();
    expect(
      parseLink(`看看 https://x.com/${'a'.repeat(600)} 再次打开`),
    ).toBeUndefined();
  });

  it('accepts a short link in share text over 500 characters', () => {
    const words = '7.43 复制打开抖音，看看【作品】'.repeat(40);
    expect(parseLink(`${words}https://v.douyin.com/iRNBho6H/ 再次打开`)).toBe(
      'https://v.douyin.com/iRNBho6H/',
    );
  });

  it('refuses a run too long to be one link, without stalling on it', () => {
    const started = Date.now();
    expect(
      parseLink(`https://x.com/p/1${'.'.repeat(200_000)}`),
    ).toBeUndefined();
    // Punctuation with more after it is what made the old strip slow.
    expect(
      parseLink(`https://x.com/p/1${'.'.repeat(200_000)}x`),
    ).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('parseVideoChange', () => {
  it('tidies a title and keeps a real editor id', () => {
    expect(parseVideoChange({ title: ' Reel  2 ', editorId: ZU })).toEqual({
      ok: true,
      value: { title: 'Reel 2', editorId: ZU },
    });
  });

  it('refuses what the table would refuse, in words', () => {
    expect(parseVideoChange({ title: '', editorId: ZU })).toMatchObject({
      ok: false,
    });
    expect(parseVideoChange({ title: 'Reel', editorId: 'x' })).toMatchObject({
      ok: false,
    });
    expect(parseVideoChange(null)).toMatchObject({ ok: false });
  });
});

describe('videoPatch', () => {
  const form = { title: 'Reel 1', editorId: ALI };

  it('writes only what the form changed', () => {
    expect(videoPatch(form, form)).toEqual({});
    expect(videoPatch({ ...form, title: 'Reel 2' }, form)).toEqual({
      title: 'Reel 2',
    });
    expect(videoPatch({ ...form, editorId: ZU }, form)).toEqual({
      editor_id: ZU,
    });
  });

  it('writes both when it does not know what the form started with', () => {
    expect(videoPatch(form, null)).toEqual({
      title: 'Reel 1',
      editor_id: ALI,
    });
  });
});

describe('doneCounts', () => {
  const from = '2026-09-01T00:00:00+08:00';
  const to = '2026-10-01T00:00:00+08:00';

  it('counts each Done in the month it was clicked, for whoever it was stamped with', () => {
    const edit = (at: string) => ({ editedAt: at, editedBy: ALI });
    const check = (at: string) => ({ verifiedAt: at, verifiedBy: KEE });
    const list = [
      video({
        id: 'a',
        ...edit('2026-09-05T02:00:00Z'),
        ...check('2026-09-06T02:00:00Z'),
      }),
      video({ id: 'b', ...edit('2026-09-30T17:00:00Z') }), // 1 Oct in Malaysia
      video({ id: 'c', ...edit('2026-08-31T15:59:00Z') }), // 31 Aug in Malaysia
      video({
        id: 'd',
        ...edit('2026-08-20T02:00:00Z'),
        ...check('2026-09-10T02:00:00Z'),
      }),
    ];
    expect(doneCounts(list, ALI, from, to)).toEqual({ edited: 1, verified: 0 });
    expect(doneCounts(list, KEE, from, to)).toEqual({ edited: 0, verified: 2 });
  });

  it('keeps the credit where it was earned when the video changes hands', () => {
    // ALI finished the edit; the video names someone else now.
    const moved = video({
      editorId: ZU,
      handlerId: ZU,
      editedAt: '2026-09-05T02:00:00Z',
      editedBy: ALI,
      verifiedAt: '2026-09-06T02:00:00Z',
      verifiedBy: KEE,
    });
    expect(finishedBy([moved], ALI, from, to).edited).toHaveLength(1);
    expect(finishedBy([moved], KEE, from, to).verified).toHaveLength(1);
    expect(doneCounts([moved], ZU, from, to)).toEqual({
      edited: 0,
      verified: 0,
    });
  });
});
