---
name: native-cover-maker

description: Creates a new Phill's Journal cover image and sets it as the Notion page cover. Use this skill whenever anyone suggests a new article title and needs a matching cover image, thumbnail, hero image, or blog header — even if they just say "make a cover for X", "create an image for this post", or "I need a header for this article". Generates the cover as a PNG entirely in code (no Figma required), uploads it to catbox.moe for hosting, and sets it as the cover photo on the relevant Notion page.

---

# Phill's Journal Cover Creator

Generates cover image variations for Phill's Journal entirely in code, uploads them to catbox.moe for hosting, and sets them as the Notion page cover.

## Cover design specs

| | |

|---|---|

| **Canvas** | 3840 × 2160 px |

| **Background** | Pre-made image from `server/src/journal_cover_background_3840x2160.png` (sourced from repo: `journal_cover_background_3840x2160.png` on `master`). The generator composites text on top of this image — do **not** draw the circle/plus badge dynamically; it is already baked into the background. |

| **Font** | Inter Bold, white `#FFFFFF`, up to 500px, −7% letter-spacing, 100% line-height |

| **Text position** | Centred horizontally and vertically |

The generator is at `server/src/journal-cover.ts` in the repo. It auto-scales the font down from 500px if a line would overflow the safe width.

## Workflow

### Step 1 — Determine the line break

The title text spans 1–2 lines separated by `\n`. Decide before generating:

- If the title contains ` & ` → line 2 starts with `& [rest]`

- If the title contains ` and ` (case-insensitive) → line 2 starts with `and [rest]`

- Multiple words, no conjunction → split roughly in half at the nearest word boundary before the midpoint, favouring a slightly shorter line 2

- Single word → no `\n`

**Examples:**

- `"AI Tools & Shopify"` → `"AI Tools\n& Shopify"`

- `"Building Better Product Pages"` → `"Building Better\nProduct Pages"`

- `"Speed"` → `"Speed"`

### Step 2 — Generate the PNG

**Prerequisites** — before running the generator, ensure these files exist:

1. **Background image** at `server/src/journal_cover_background_3840x2160.png`. If missing:
   ```bash
   curl -L -o server/src/journal_cover_background_3840x2160.png \
     "https://raw.githubusercontent.com/br-creative/paperclip/master/journal_cover_background_3840x2160.png"
   ```

2. **Font file** at `server/src/fonts/Inter-Bold.ttf`. If missing:
   ```bash
   mkdir -p server/src/fonts
   curl -L -o server/src/fonts/Inter-Bold.ttf \
     "https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.ttf"
   ```

Write a small runner script and execute it with `tsx`:

```bash

cat > /tmp/gen-cover.mts << 'SCRIPT'

import { generateJournalCover } from "./server/src/journal-cover.js";

const title = process.argv[2].replace(/\\n/g, "\n");

await generateJournalCover({ title, outPath: process.argv[3] });

console.log("Generated:", process.argv[3]);

SCRIPT

npx --yes tsx /tmp/gen-cover.mts "TITLE_WITH_NEWLINE" /tmp/journal-cover.png

```

Replace `TITLE_WITH_NEWLINE` with the split title from Step 1, using a literal `\n` for the line break (e.g. `"AI Tools\n& Shopify"`).

### Step 3 — Upload to catbox.moe

Upload the generated PNG to catbox.moe to get a publicly accessible URL:

```bash

curl -F "reqtype=fileupload" \
  -F "fileToUpload=@/tmp/journal-cover.png" \
  https://catbox.moe/user/api.php

```

The response body is the direct URL (e.g. `https://files.catbox.moe/abc123.png`). Save this as the hosted cover URL.

### Step 4 — Set as cover on the Notion page

Use the Notion MCP to update the page cover with the catbox.moe URL. The Notion page ID comes from the content writer's context (they will have provided a Notion page URL or ID):

```

notion-update-page(

page_id: <notion_page_id>,

cover: { type: "external", external: { url: "<catbox_url>" } }

)

```

Confirm back to the content writer with:

- The cover image URL

- Confirmation that the Notion page cover has been updated

## Notes

- `tsx` is invoked via `npx --yes tsx` — no global install needed

- The generator handles font auto-scaling, so long titles still render correctly

- Anonymous catbox.moe uploads have no guaranteed retention policy — if a cover URL stops working, re-upload the image