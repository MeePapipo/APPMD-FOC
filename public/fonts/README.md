# Thai PDF font

The PDF export (`src/lib/export/pdf.tsx`) needs **Sarabun** here:

- `Sarabun-Regular.ttf`
- `Sarabun-Bold.ttf`

`@react-pdf/renderer` ships only the 14 standard PDF fonts, none of which have
Thai glyphs, so without these files every Thai label renders as blanks. The
route detects their absence and returns a 503 telling the rep to use the Excel
export instead, rather than emitting a silently broken PDF.

Sarabun is licensed **SIL Open Font License 1.1**, so it can live in this repo
and ship inside the container. `Dockerfile` already copies `public/` into the
runtime image, so nothing else needs changing.

## Fetching it

```sh
curl -L -o public/fonts/Sarabun-Regular.ttf \
  https://github.com/cadsondemak/Sarabun/raw/master/fonts/Sarabun-Regular.ttf
curl -L -o public/fonts/Sarabun-Bold.ttf \
  https://github.com/cadsondemak/Sarabun/raw/master/fonts/Sarabun-Bold.ttf
```

## Verifying it

```sh
npm test -- pdf                                        # render test un-skips itself
WRITE_PDF=1 npx vitest run pdf.render                  # writes /tmp/foc-summary-sample.pdf
npx tsx scripts/check-pdf-thai.mts /tmp/foc-summary-sample.pdf
```

The last one is the one that matters: it inflates the PDF's ToUnicode CMap and
counts code points in U+0E00–U+0E7F. An embedded font alone proves nothing —
the Latin labels would embed it too even if every Thai glyph had been dropped.

Do **not** substitute a Windows font (Tahoma, Leelawadee). They have Thai
coverage but are not redistributable.
