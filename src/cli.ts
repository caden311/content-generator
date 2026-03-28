import * as fs from "node:fs";
import * as path from "node:path";
import { defaultGenerationConfig } from "./config/index.js";
import { PipelineOrchestrator } from "./pipeline/orchestrator.js";
import { logger } from "./utils/logger.js";
import type { ModelTier, MusicMood } from "./types/index.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help")) {
    console.log(`
Usage: npm run generate -- <script-file> [options]

Options:
  --tier <budget|standard|premium>  Model quality tier (default: standard)
  --output <dir>                    Output directory (default: ./output)
  --voice <voice-id>                Voice ID for TTS
  --aspect <16:9|9:16|1:1>         Aspect ratio (default: 16:9)
  --format <youtube|shorts>         Named alias: youtube=16:9, shorts=9:16
  --dry-run                         Skip all API calls, generate placeholder media locally
  --music <mood|path>               Background music: calm, epic, upbeat, focus, or a file path
  --music-volume <0.0-1.0>          Music volume relative to narration (default: 0.12)
  --help                            Show this help

Examples:
  npm run generate -- script.txt
  npm run generate -- script.txt --tier premium
  npm run generate -- script.txt --format shorts
  echo "My script text" | npm run generate -- -
    `);
    process.exit(0);
  }

  // Parse arguments
  let scriptPath = args[0]!;
  let tier: ModelTier = "standard";
  let outputDir = "./output";
  let voice: string | undefined;
  let aspectRatio: "16:9" | "9:16" | "1:1" = "16:9";
  let dryRun = false;
  let musicTrack: string | undefined;
  let musicVolume: number | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--tier":
        tier = (args[++i] ?? "standard") as ModelTier;
        break;
      case "--output":
        outputDir = args[++i] ?? "./output";
        break;
      case "--voice":
        voice = args[++i];
        break;
      case "--aspect":
        aspectRatio = (args[++i] ?? "16:9") as "16:9" | "9:16" | "1:1";
        break;
      case "--format": {
        const fmt = args[++i];
        if (fmt === "youtube") aspectRatio = "16:9";
        else if (fmt === "shorts") aspectRatio = "9:16";
        break;
      }
      case "--dry-run":
        dryRun = true;
        break;
      case "--music":
        musicTrack = args[++i];
        break;
      case "--music-volume":
        musicVolume = parseFloat(args[++i] ?? "0.12");
        break;
    }
  }

  // Read script
  let script: string;
  if (scriptPath === "-") {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    script = Buffer.concat(chunks).toString("utf-8");
  } else {
    scriptPath = path.resolve(scriptPath);
    if (!fs.existsSync(scriptPath)) {
      logger.error(`Script file not found: ${scriptPath}`);
      process.exit(1);
    }
    script = await fs.promises.readFile(scriptPath, "utf-8");
  }

  if (!script.trim()) {
    logger.error("Script is empty");
    process.exit(1);
  }

  logger.info(`Script loaded (${script.length} chars)`);
  logger.info(`Tier: ${tier}, Aspect: ${aspectRatio}`);
  if (dryRun) logger.info("Dry run mode — no API calls will be made");

  const overrides: Partial<import("./types/index.js").GenerationConfig> = {
    modelTier: tier,
    outputDir,
    aspectRatio,
    dryRun,
  };
  if (voice !== undefined) {
    overrides.voice = voice;
  }
  if (musicTrack !== undefined) {
    overrides.music = {
      track: musicTrack as MusicMood | string,
      ...(musicVolume !== undefined ? { volume: musicVolume } : {}),
    };
  }
  const config = defaultGenerationConfig(overrides);

  const pipeline = new PipelineOrchestrator(config);
  const project = await pipeline.run(script);

  if (project.status === "complete") {
    logger.info(`Done! Output: ${project.outputPath}`);
  } else {
    logger.error(`Pipeline failed: ${project.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Fatal error", error);
  process.exit(1);
});
