/**
 * journal-cover.ts — headless Journal cover image generator
 *
 * Produces a 1920×1080 PNG matching the Phill's Journal cover spec:
 *   - Background:  #121212
 *   - Title text:  Inter Bold, white (#FFFFFF), up to 250px, letter-spacing -7%,
 *                  line-height 100%, centred horizontally and vertically
 *   - Bottom-right badge: red (#DE0015) circle 350×350px with top-left at x=1570
 *                  y=730 (perfectly flush with canvas corner), containing a white
 *                  "+" drawn as two overlapping filled rectangles
 *
 * The title is supplied pre-split with an optional "\n". Font size auto-scales
 * down from 250px so that every line fits within SAFE_WIDTH (1920 − 2×50px).
 *
 * Dependencies:
 *   npm install @napi-rs/canvas
 *   (bundled Inter-Bold.ttf must sit at FONT_PATH, see below)
 *
 * Railway / headless notes:
 *   @napi-rs/canvas ships pre-built native binaries — no system libs, no display
 *   required. Works on node:lts-trixie-slim (Debian) without extra apt packages.
 */

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Canvas / design constants ─────────────────────────────────────────────────

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const BG_COLOR = "#121212";
const TEXT_COLOR = "#ffffff";

const FONT_SIZE_MAX = 250; // px — will shrink if lines overflow
const LETTER_SPACING_EM = -0.07; // −7% of current font size
const LINE_HEIGHT_EM = 1.0; // 100%
const H_PADDING = 50; // px safe margin on each horizontal edge
const SAFE_WIDTH = CANVAS_W - H_PADDING * 2; // 1820px

// Badge (red circle, bottom-right corner)
const BADGE_X = 1570; // top-left x  — right edge is exactly CANVAS_W
const BADGE_Y = 730; // top-left y  — bottom edge is exactly CANVAS_H
const BADGE_RADIUS = 175; // 350 / 2
const BADGE_COLOR = "#DE0015";
const BADGE_CX = BADGE_X + BADGE_RADIUS; // 1745
const BADGE_CY = BADGE_Y + BADGE_RADIUS; // 905

// Plus sign proportions (as fractions of BADGE_RADIUS)
const PLUS_ARM_RATIO = 0.457; // half-arm length → ~80px
const PLUS_THICK_RATIO = 0.16; // bar thickness  → ~28px

// ─── Font registration ─────────────────────────────────────────────────────────

// Expected location: server/src/fonts/Inter-Bold.ttf
// On Railway: bundle the TTF as a build artifact so it is present at runtime.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// ─── Public API ────────────────────────────────────────────────────────────────

export interface GenerateCoverOptions {
  /** Title text. Use a literal "\n" to force a line break. */
  title: string;
  /** Override path to Inter TTF (defaults to server/src/fonts/Inter-Bold.ttf). */
  fontPath?: string;
  /** If provided, the PNG buffer is also written to this file path. */
  outPath?: string;
}

/**
 * Generate a Phill's Journal cover image.
 *
 * @returns PNG as a Node.js Buffer.
 */
export function generateJournalCover(opts: GenerateCoverOptions): Buffer {
  const { title, fontPath, outPath } = opts;
  if (!title) throw new Error("title is required");

  ensureFont(fontPath);

  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  const ctx = canvas.getContext("2d");

  // ── 1. Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ── 2. Title text ─────────────────────────────────────────────────────────────
  const lines = title.split("\n");

  // Auto-scale: binary-search replacement would be faster, but linear descent
  // from 250 is imperceptible (<250 iterations max) and simpler to audit.
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

  // ── 3. Badge ──────────────────────────────────────────────────────────────────
  // Circle
  ctx.fillStyle = BADGE_COLOR;
  ctx.beginPath();
  ctx.arc(BADGE_CX, BADGE_CY, BADGE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Plus sign — two filled rectangles, centred on the circle
  const arm = Math.round(BADGE_RADIUS * PLUS_ARM_RATIO); // ~80px
  const thick = Math.round(BADGE_RADIUS * PLUS_THICK_RATIO); // ~28px
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillRect(BADGE_CX - arm, BADGE_CY - thick / 2, arm * 2, thick); // horizontal
  ctx.fillRect(BADGE_CX - thick / 2, BADGE_CY - arm, thick, arm * 2); // vertical

  // ── 4. Encode & return ────────────────────────────────────────────────────────
  const png = canvas.toBuffer("image/png");
  if (outPath) writeFileSync(outPath, png);
  return png;
}
