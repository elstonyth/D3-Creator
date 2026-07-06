// Build app icon from the REAL D3 mark (d3-smallogo.png) — no redraw, just upscale + brand canvas.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SRC  = 'd3-smallogo.png';          // canonical square mark, transparent, shadow-free
const SIZE = 1024;                        // within 512–1024 spec
const MARK = 760;                         // upscaled mark size on canvas (~13% padding)
const BG   = { r: 0x0a, g: 0x0a, b: 0x0d, alpha: 1 }; // brand near-black #0A0A0D

// Trim transparent margin, upscale the real art with high-quality kernel.
const trimmed = await sharp(SRC).trim().toBuffer();
const mark = await sharp(trimmed)
  .resize(MARK, MARK, { fit: 'contain', kernel: 'lanczos3',
                        background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toBuffer();

const out = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: BG } })
  .composite([{ input: mark, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync('d3-app-icon-1024.png', out);
const meta = await sharp(out).metadata();
console.log(`wrote d3-app-icon-1024.png  ${meta.width}x${meta.height}  ${(out.length/1024).toFixed(1)} KB`);
