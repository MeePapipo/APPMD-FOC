/**
 * Extracts the visible text from a generated PDF, so layout changes can be
 * verified rather than guessed at.
 *
 * There is no poppler in this environment, so without this there is no way to
 * check what a PDF actually says — only that it is a PDF. It reads the
 * ToUnicode CMap (glyph id -> code point) and decodes the glyph ids in the
 * content stream's show-text operators back through it.
 *
 * Deliberately minimal: it handles the subset @react-pdf emits — Flate
 * streams, Identity-H composite fonts, and the array form of `bfrange` — not
 * PDF in general.
 *
 * Run: npx tsx scripts/pdf-text.mts /tmp/foc-summary-sample.pdf [--grep TEXT]
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const file = process.argv[2];
if (!file) throw new Error("usage: tsx scripts/pdf-text.mts <file.pdf> [--grep TEXT]");
const grepAt = process.argv.indexOf("--grep");
const grep = grepAt === -1 ? null : process.argv[grepAt + 1];

const pdf = readFileSync(file);
const raw = pdf.toString("latin1");

const streams: string[] = [];
const streamRe = /stream\r?\n/g;
let m: RegExpExecArray | null;
while ((m = streamRe.exec(raw)) !== null) {
  const start = m.index + m[0].length;
  const end = raw.indexOf("endstream", start);
  if (end === -1) continue;
  try {
    streams.push(inflateSync(pdf.subarray(start, end)).toString("latin1"));
  } catch {
    /* font programs, images — not text */
  }
}

const hexToText = (hex: string) => {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    out += String.fromCodePoint(parseInt(hex.slice(i, i + 4), 16));
  }
  return out;
};

/** glyph id -> the characters it stands for. */
const toUnicode = new Map<number, string>();
for (const s of streams) {
  if (!s.includes("begincmap")) continue;

  // Array form: <start> <end> [<dst> <dst> ...] — one destination per glyph.
  for (const range of s.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4})>\s*\[([^\]]*)\]/g)) {
    const start = parseInt(range[1], 16);
    const items = [...range[3].matchAll(/<([0-9a-fA-F\s]+)>/g)];
    items.forEach((item, i) => {
      toUnicode.set(start + i, hexToText(item[1].replace(/\s+/g, "")));
    });
  }
  // Pair form: <start> <end> <dstStart> — consecutive code points.
  for (const range of s.matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4,})>/g)) {
    const start = parseInt(range[1], 16);
    const end = parseInt(range[2], 16);
    const dst = parseInt(range[3].slice(0, 4), 16);
    for (let g = start; g <= end; g++) {
      if (!toUnicode.has(g)) toUnicode.set(g, String.fromCodePoint(dst + (g - start)));
    }
  }
  // Single form: bfchar <src> <dst>.
  const bfchar = /beginbfchar([\s\S]*?)endbfchar/g;
  let block: RegExpExecArray | null;
  while ((block = bfchar.exec(s)) !== null) {
    for (const pair of block[1].matchAll(/<([0-9a-fA-F]{4})>\s*<([0-9a-fA-F]{4,})>/g)) {
      toUnicode.set(parseInt(pair[1], 16), hexToText(pair[2]));
    }
  }
}

const decode = (hex: string) => {
  let out = "";
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    out += toUnicode.get(parseInt(hex.slice(i, i + 4), 16)) ?? "�";
  }
  return out;
};

let page = 0;
let matches = 0;
for (const s of streams) {
  if (!/\bTJ\b|\bTj\b/.test(s)) continue;
  page += 1;
  const runs: string[] = [];
  for (const block of s.split(/\bBT\b/).slice(1)) {
    let text = "";
    for (const hex of block.matchAll(/<([0-9a-fA-F]+)>/g)) text += decode(hex[1]);
    if (text.trim()) runs.push(text);
  }
  if (grep) {
    const hits = runs.filter((r) => r.includes(grep));
    matches += hits.length;
    for (const hit of hits) console.log(`page ${page}: ${hit}`);
  } else {
    console.log(`\n───── page ${page} · ${runs.length} runs ─────`);
    for (const run of runs) console.log(`  ${run}`);
  }
}

if (grep) {
  console.log(`\n${matches} run(s) contain ${JSON.stringify(grep)}`);
  process.exitCode = matches > 0 ? 0 : 1;
}
