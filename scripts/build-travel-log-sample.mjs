import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleRoot = join(__dirname, "../src/packs/travelLogSample");
const outPath = join(__dirname, "../public/samples/travel-log.zip");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function buildTravelLogSampleZip() {
  const zip = new JSZip();
  const root = zip.folder("travel-log");
  if (!root) {
    throw new Error("Failed to create travel-log folder in zip");
  }

  root.file(
    "manifest.json",
    JSON.stringify(readJson(join(sampleRoot, "manifest.json")), null, 2),
  );

  const content = root.folder("content");
  if (!content) {
    throw new Error("Failed to create content folder in zip");
  }
  content.file(
    "travel-log.json",
    JSON.stringify(readJson(join(sampleRoot, "content/travel-log.json")), null, 2),
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath} (${buffer.byteLength} bytes)`);
}

buildTravelLogSampleZip().catch((error) => {
  console.error(error);
  process.exit(1);
});
