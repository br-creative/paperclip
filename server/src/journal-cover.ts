/**
 * journal-cover.ts — headless Journal cover image generator
 *
 * Produces a 3840×2160 PNG matching the Phill's Journal cover spec:
 *   - Background:  Pre-made image (journal_cover_background_3840x2160.png)
 *                  which includes the red circle + "+" badge already baked in
 *   - Title text:  Inter Bold, white (#FFFFFF), up to 500px, letter-spacing -7%,
 *                  line-height 100%, centred horizontally and vertically
 *
 * The title is supplied pre-split with an optional "\n". Font size auto-scales
 * down from 500px so that every line fits within SAFE_WIDTH (3840 − 2×100px).
 *
 * Dependencies:
 *   npm install @napi-rs/canvas
 *   (bundled Inter-Bold.ttf must sit at FONT_PATH, see below)
 *   (background image must sit at BG_IMAGE_PATH, see below)
 *
 * Railway / headless notes:
 *   @napi-rs/canvas ships pre-built native binaries — no system libs, no display
 *   required. Works on node:lts-trixie-slim (Debian) without extra apt packages.
 */

import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Canvas / design constants ─────────────────────────────────────────────────

const CANVAS_W = 3840;
const CANVAS_H = 2160;

const TEXT_COLOR = "#ffffff";

const FONT_SIZE_MAX = 500; // px — will shrink if lines overflow (2× of old 250px)
const LETTER_SPACING_EM = -0.07; // −7% of current font size
const LINE_HEIGHT_EM = 1.0; // 100%
const H_PADDING = 100; // px safe margin on each horizontal edge (2× of old 50px)
const SAFE_WIDTH = CANVAS_W - H_PADDING * 2; // 3640px

// ─── File paths ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Font registration ─────────────────────────────────────────────────────────

const FONT_CANDIDATES = [
  join(__dirname, "fonts", "Inter-Bold.ttf"),
  join(__dirname, "fonts", "Inter-variable.ttf"),
  join(__dirname, "Inter-Bold.ttf"),
];

let fontLoaded = false;

function ensureFont(overridePath?: string): void {
  if (fontLoaded) return;

  const fontPath =
    overridePath ?? FONT_CANDIDATES.find((p) => existsSync(p));

  if (!fontPath) {
    throw new Error(
      "Inter font TTF not found. Place Inter-Bold.ttf at server/src/fonts/ " +
        "or pass fontPath explicitly.",
    );
  }

  const buf = readFileSync(fontPath);
  GlobalFonts.register(buf, "Inter");

  if (!GlobalFonts.has("Inter")) {
    throw new Error(`Failed to register Inter font from: ${fontPath}`);
  }

  fontLoaded = true;
}

// ─── Background image ─────────────────────────────────────────────────────────

const BG_IMAGE_CANDIDATES = [
  join(__dirname, "journal_cover_background_3840x2160.png"),
  join(__dirname, "..", "..", "journal_cover_background_3840x2160.png"),
];

function findBgImage(overridePath?: string): string {
  const bgPath =
    overridePath ?? BG_IMAGE_CANDIDATES.find((p) => existsSync(p));

  if (!bgPath) {
    throw new Error(
      "Background image not found. Place journal_cover_background_3840x2160.png " +
        "at server/src/ or pass bgImagePath explicitly.",
    );
  }

  return bgPath;
}

// ─── Public API ────────────────────────────────────────────────────────────────

export interface GenerateCoverOptions {
  /** Title text. Use a literal "\n" to force a line break. */
  title: string;
  /** Override path to Inter TTF (defaults to server/src/fonts/Inter-Bold.ttf). */
  fontPath?: string;
  /** Override path to background PNG (defaults to server/src/journal_cover_background_3840x2160.png). */
  bgImagePath?: string;
  /** If provided, the PNG buffer is also written to this file path. */
  outPath?: string;
}

/**
 * Generate a Phill's Journal cover image.
 *
 * @returns PNG as a Node.js Buffer.
 */
export async function generateJournalCover(opts: GenerateCoverOptions): Promise<Buffer> {
  const { title, fontPath, bgImagePath, outPath } = opts;
  if (!title) throw new Error("title is required");

  ensureFont(fontPath);

  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext("2d");

  // ── 1. Background image ───────────────────────────────────────────────────────
  const bgPath = findBgImage(bgImagePath);
  const bgImage = await loadImage(bgPath);
  ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H);

  // ── 2. Title text ─────────────────────────────────────────────────────────────
  const lines = title.split("\n");

  let fontSize = FONT_SIZE_MAX;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  while (fontSize > 10) {
    ctx.font = `700 ${fontSize}px Inter`;
    ctx.letterSpacing = `${LETTER_SPACING_EM * fontSize}px`;
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (maxW <= SAFE_WIDTH) break;
    fontSize -= 1;
  }

  const lineHeight = fontSize * LINE_HEIGHT_EM;
  const blockH = lines.length * lineHeight;
  const startY = CANVAS_H / 2 - blockH / 2 + lineHeight / 2;

  ctx.fillStyle = TEXT_COLOR;
  lines.forEach((line, i) => {
    ctx.fillText(line, CANVAS_W / 2, startY + i * lineHeight);
  });

  // ── 3. Encode & return ────────────────────────────────────────────────────────
  const png = canvas.toBuffer("image/png");
  if (outPath) writeFileSync(outPath, png);
  return png;
}
