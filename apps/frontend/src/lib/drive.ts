/**
 * Google Drive file-ID parsing + embed/download URL builders for the online
 * classes catalog. Admins paste any Drive link; we store only the file ID.
 */
const FILE_D = /\/file\/d\/([a-zA-Z0-9_-]+)/; // /file/d/<id>/view
const ID_PARAM = /[?&]id=([a-zA-Z0-9_-]+)/; // open?id=<id> / uc?id=<id>
const BARE = /^[a-zA-Z0-9_-]{10,}$/; // a bare id

export function parseDriveFileId(input: string): string | null {
  const s = (input ?? '').trim();
  if (!s) return null;
  // Only trust Drive hosts for URL parsing; a bare id (no scheme/host) is still ok.
  if (!s.includes('drive.google.com') && !BARE.test(s)) return null;
  const m = s.match(FILE_D) ?? s.match(ID_PARAM);
  if (m) return m[1];
  if (BARE.test(s)) return s;
  return null;
}

export function drivePreviewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function driveDownloadUrl(id: string): string {
  return `https://drive.google.com/uc?export=download&id=${id}`;
}
