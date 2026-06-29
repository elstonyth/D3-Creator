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
