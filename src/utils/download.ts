import * as fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export async function downloadFile(
  url: string,
  outputPath: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  const fileStream = fs.createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(response.body as never), fileStream);
}
