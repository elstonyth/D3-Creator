/**
 * The ladder test PRD 1 §8.5 requires in CI. Without it the bitrate ladder is
 * enforced by nobody and the 15 MB cap is a comment.
 *
 * Pure functions only — nothing here spawns a process, and nothing here reaches
 * `config.ts` (PRD 1 §8.2).
 */

import { MAX_COMPRESSED_BYTES } from './contract';
import {
  buildAudioArgs,
  buildCompressArgs,
  buildThumbnailArgs,
  encodeSettingsFor,
  LADDER,
  MAX_RETRY_HEIGHT,
  MIN_RETRY_VIDEO_KBPS,
  pickLadderRow,
  retryEncodeSettings,
  thumbnailSeekSeconds,
} from './ffmpeg';

/** Decimal, matching the cap and §8.5's "computed in decimal" note. */
function predictedBytes(seconds: number, videoKbps: number, audioKbps: number) {
  return ((videoKbps + audioKbps) * 1000 * seconds) / 8;
}

describe('the bitrate ladder (§8.5)', () => {
  it('is §8.5’s five rows, in order, with their exact figures', () => {
    expect(LADDER).toEqual([
      { maxSeconds: 30, maxHeight: 720, videoKbps: 1500, audioKbps: 128 },
      { maxSeconds: 60, maxHeight: 720, videoKbps: 1300, audioKbps: 96 },
      { maxSeconds: 90, maxHeight: 540, videoKbps: 900, audioKbps: 96 },
      { maxSeconds: 180, maxHeight: 480, videoKbps: 450, audioKbps: 64 },
      { maxSeconds: 300, maxHeight: 360, videoKbps: 260, audioKbps: 48 },
    ]);
  });

  it('every row lands under 12 MB at its own upper bound — 20% headroom', () => {
    for (const row of LADDER) {
      const size = predictedBytes(row.maxSeconds, row.videoKbps, row.audioKbps);
      expect(size).toBeLessThan(12_000_000);
      expect(size).toBeLessThan(MAX_COMPRESSED_BYTES);
    }
  });

  it('steps resolution down with bitrate, never up', () => {
    for (let i = 1; i < LADDER.length; i += 1) {
      expect(LADDER[i].maxHeight).toBeLessThanOrEqual(LADDER[i - 1].maxHeight);
      expect(LADDER[i].videoKbps).toBeLessThan(LADDER[i - 1].videoKbps);
      expect(LADDER[i].maxSeconds).toBeGreaterThan(LADDER[i - 1].maxSeconds);
    }
  });

  it('picks the FIRST row whose upper bound the duration does not exceed', () => {
    expect(pickLadderRow(0.5)).toBe(LADDER[0]);
    expect(pickLadderRow(30)).toBe(LADDER[0]); // inclusive
    expect(pickLadderRow(30.1)).toBe(LADDER[1]);
    expect(pickLadderRow(60)).toBe(LADDER[1]);
    expect(pickLadderRow(74)).toBe(LADDER[2]);
    expect(pickLadderRow(90)).toBe(LADDER[2]);
    expect(pickLadderRow(180)).toBe(LADDER[3]);
    expect(pickLadderRow(300)).toBe(LADDER[4]);
  });

  it('the base code’s own 1500k + 128k holds only about 74 seconds', () => {
    // The figure §8.5 quotes, and the reason the ladder has to exist before §9.
    const seconds = MAX_COMPRESSED_BYTES / ((1500 + 128) * 125);
    expect(Math.round(seconds)).toBe(74);
  });
});

describe('the single re-encode (§8.5)', () => {
  const row = LADDER[0]; // 720 px, 1500 kbps, 128 kbps audio

  it('scales the NOMINAL bitrate down by how far the file overshot', () => {
    const overshot = 20_000_000;
    const retry = retryEncodeSettings(row, overshot, true);
    expect(retry.videoKbps).toBe(
      Math.floor((1500 * MAX_COMPRESSED_BYTES * 0.9) / overshot),
    );
    expect(retry.videoKbps).toBeLessThan(row.videoKbps);
  });

  it('never rises above the row’s own height, and never above 480', () => {
    expect(retryEncodeSettings(LADDER[0], 20_000_000, true).maxHeight).toBe(
      480,
    );
    // Row 5 is 360 px: a retry meant to shrink must not upscale it to 480.
    expect(retryEncodeSettings(LADDER[4], 20_000_000, true).maxHeight).toBe(
      360,
    );
    for (const r of LADDER) {
      const retry = retryEncodeSettings(r, 20_000_000, true);
      expect(retry.maxHeight).toBeLessThanOrEqual(r.maxHeight);
      expect(retry.maxHeight).toBeLessThanOrEqual(MAX_RETRY_HEIGHT);
    }
  });

  it('floors at 150 kbps however far the file overshot', () => {
    expect(retryEncodeSettings(row, 2_000_000_000, true).videoKbps).toBe(
      MIN_RETRY_VIDEO_KBPS,
    );
  });

  it('keeps the row’s audio bitrate, and drops it entirely on a silent source', () => {
    expect(retryEncodeSettings(row, 20_000_000, true).audioKbps).toBe(128);
    expect(retryEncodeSettings(row, 20_000_000, false).audioKbps).toBeNull();
  });
});

describe('the encode argv', () => {
  const settings = encodeSettingsFor(LADDER[2], true); // 540 px, 900k, 96k

  it('changes exactly five flags between rows and pins the rest', () => {
    const args = buildCompressArgs('in.mov', 'out.mp4', settings);
    expect(args).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      'in.mov',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-profile:v',
      'high',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '24',
      '-vf',
      'scale=-2:trunc(min(ih\\,540)/2)*2',
      '-b:v',
      '900k',
      '-maxrate',
      '900k',
      '-bufsize',
      '1800k',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      '-movflags',
      '+faststart',
      'out.mp4',
    ]);
  });

  it('escapes the filtergraph comma, or ffmpeg reads it as a filter separator', () => {
    const vf = buildCompressArgs('in.mp4', 'out.mp4', settings)[18];
    expect(vf).toContain('\\,');
    expect(vf).not.toMatch(/min\(ih,/);
  });

  it('bufsize is always twice the video bitrate, on every row', () => {
    for (const row of LADDER) {
      const args = buildCompressArgs(
        'in.mp4',
        'out.mp4',
        encodeSettingsFor(row, true),
      );
      const bufsize = args[args.indexOf('-bufsize') + 1];
      expect(bufsize).toBe(`${row.videoKbps * 2}k`);
    }
  });

  it('a silent source gets -an, never -c:a aac', () => {
    const args = buildCompressArgs(
      'in.mp4',
      'out.mp4',
      encodeSettingsFor(LADDER[0], false),
    );
    expect(args).toContain('-an');
    expect(args).not.toContain('-c:a');
    expect(args).not.toContain('aac');
  });
});

describe('the audio extract and the poster frame', () => {
  it('extracts mono 16 kHz MP3 at 48 kbps', () => {
    expect(buildAudioArgs('src.mp4', 'audio.mp3')).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      'src.mp4',
      '-vn',
      '-c:a',
      'libmp3lame',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '48k',
      'audio.mp3',
    ]);
  });

  it('seeks min(1.0, duration * 0.5) — half a second into a 1-second clip', () => {
    expect(thumbnailSeekSeconds(1)).toBe(0.5);
    expect(thumbnailSeekSeconds(0.4)).toBe(0.2);
    expect(thumbnailSeekSeconds(47)).toBe(1);
    expect(thumbnailSeekSeconds(300)).toBe(1);
  });

  it('takes the poster frame from compressed.mp4, not from the source', () => {
    const args = buildThumbnailArgs('compressed.mp4', 'thumbnail.jpg', 47);
    expect(args[args.indexOf('-i') + 1]).toBe('compressed.mp4');
    expect(args[args.indexOf('-ss') + 1]).toBe('1');
    expect(args).toContain('-frames:v');
  });
});
