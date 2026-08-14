import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const supply = Number.parseInt(process.env.SKATE_SUPPLY ?? "500", 10);
if (!Number.isSafeInteger(supply) || supply < 1) {
  throw new Error("SKATE_SUPPLY must be a positive integer");
}

const root = resolve(import.meta.dirname, "..");
const templatePath = resolve(root, "metadata", "metadata-template.json");
const outputDir = resolve(root, "metadata", "generated");
const template = await readFile(templatePath, "utf8");

if (template.includes("REPLACE_WITH_IMAGE_CID")) {
  throw new Error("Set the final IPFS image CID in metadata-template.json first");
}

await mkdir(outputDir, { recursive: true });
for (let tokenId = 1; tokenId <= supply; tokenId += 1) {
  const metadata = template.replaceAll("{id}", String(tokenId));
  JSON.parse(metadata);
  await writeFile(resolve(outputDir, `${tokenId}.json`), `${metadata}\n`, "utf8");
}

console.log(`Generated ${supply} SIP-016 metadata files in ${outputDir}`);
