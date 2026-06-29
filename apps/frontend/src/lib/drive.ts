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
  // A bare id (no scheme/host) is accepted directly.
  if (BARE.test(s)) return s;

  // Otherwise it must be a real Drive URL — parse and check the host EXACTLY,
  // so a lookalike like `drive.google.com.evil.com` or `x.com/?u=drive.google.com`
  // cannot smuggle an id through a substring match.
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.hostname !== 'drive.google.com') return null;

  const m = url.pathname.match(FILE_D) ?? url.search.match(ID_PARAM);
  return m ? m[1] : null;
}

export function drivePreviewUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function driveDownloadUrl(id: string): string {
  return `https://drive.google.com/uc?export=download&id=${id}`;
}
