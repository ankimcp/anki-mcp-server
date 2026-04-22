#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, "..", "assets", "source", "favicon-owl.svg");
const OUTPUT = resolve(__dirname, "..", "icon.png");
const SIZE = 512;

await sharp(SOURCE)
  .resize(SIZE, SIZE, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(OUTPUT);

console.log(`Generated ${OUTPUT} (${SIZE}x${SIZE})`);
