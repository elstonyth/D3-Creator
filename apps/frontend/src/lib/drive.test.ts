import { parseDriveFileId, drivePreviewUrl, driveDownloadUrl } from './drive';

const ID = '1AbC_def-GHI23';

describe('parseDriveFileId', () => {
  it('parses /file/d/<id>/view', () => {
    expect(
      parseDriveFileId(
        `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
      ),
    ).toBe(ID);
  });
  it('parses open?id=<id>', () => {
    expect(parseDriveFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });
  it('parses uc?id=<id>', () => {
    expect(
      parseDriveFileId(`https://drive.google.com/uc?export=download&id=${ID}`),
    ).toBe(ID);
  });
  it('accepts a bare id', () => {
    expect(parseDriveFileId(ID)).toBe(ID);
  });
  it('rejects junk', () => {
    expect(parseDriveFileId('https://example.com/not-drive')).toBeNull();
    expect(parseDriveFileId('')).toBeNull();
  });
  it('rejects a non-drive url that carries an id param', () => {
    expect(parseDriveFileId(`https://example.com/share?id=${ID}`)).toBeNull();
  });
  it('prefers /file/d/ over ?id= when both present', () => {
    expect(
      parseDriveFileId(`https://drive.google.com/file/d/${ID}/view?id=WRONG`),
    ).toBe(ID);
  });
  it('rejects lookalike hosts (exact hostname match, not substring)', () => {
    expect(
      parseDriveFileId(`https://drive.google.com.evil.com/file/d/${ID}/view`),
    ).toBeNull();
    expect(
      parseDriveFileId(`https://notdrive.google.com/file/d/${ID}/view`),
    ).toBeNull();
    expect(
      parseDriveFileId(`https://evil.com/?next=drive.google.com&id=${ID}`),
    ).toBeNull();
  });
});

describe('url builders', () => {
  it('builds preview + download urls', () => {
    expect(drivePreviewUrl(ID)).toBe(
      `https://drive.google.com/file/d/${ID}/preview`,
    );
    expect(driveDownloadUrl(ID)).toBe(
      `https://drive.google.com/uc?export=download&id=${ID}`,
    );
  });
});
