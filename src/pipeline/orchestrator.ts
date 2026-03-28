import * as fs from "node:fs";
import * as path from "node:path";
import { v4 as uuid } from "uuid";
import { createAdapters, type AdapterSet } from "../adapters/factory.js";
import { createDryRunAdapters } from "../adapters/dry-run.js";
import { assembleVideo } from "../assembly/ffmpeg.js";
import { generateASS } from "../utils/subtitles.js";
import { generateYouTubeMetadata } from "../utils/youtube-metadata.js";
import { logger } from "../utils/logger.js";
import type {
  GeneratedAssets,
  GenerationConfig,
  SceneBreakdown,
  VideoProject,
} from "../types/index.js";

export class PipelineOrchestrator {
  private adapters: AdapterSet;
  private config: GenerationConfig;

  constructor(config: GenerationConfig) {
    this.config = config;
    this.adapters = config.dryRun ? createDryRunAdapters() : createAdapters(config.modelTier);
  }

  async run(script: string): Promise<VideoProject> {
    const projectId = uuid();
    let projectDir = path.join(this.config.outputDir, projectId);

    const project: VideoProject = {
      id: projectId,
      script,
      breakdown: { title: "", scenes: [], totalDuration: 0 },
      assets: [],
      status: "processing",
      createdAt: new Date(),
    };

    try {
      // Step 1: Scene breakdown
      logger.info("Breaking down script into scenes...");
      const maxDuration = this.config.aspectRatio === "9:16" ? 60 : undefined;
      project.breakdown = await this.adapters.llm.breakdownScript(script, maxDuration);
      logger.info(
        `Generated ${project.breakdown.scenes.length} scenes, ~${project.breakdown.totalDuration}s total`,
      );

      // Create sequentially numbered project directory
      projectDir = nextSequentialDir(this.config.outputDir, project.breakdown.title);
      await fs.promises.mkdir(projectDir, { recursive: true });

      // Save breakdown for debugging
      await fs.promises.writeFile(
        path.join(projectDir, "breakdown.json"),
        JSON.stringify(project.breakdown, null, 2),
      );

      // Step 2: Generate assets in parallel per scene
      logger.info("Generating assets for all scenes...");
      project.assets = await this.generateAllAssets(
        project.breakdown,
        projectDir,
      );

      // Step 3: Generate subtitles
      let subtitlesPath: string | undefined;
      try {
        logger.info("Generating subtitles...");
        const sortedAssets = [...project.assets].sort(
          (a, b) => a.sceneIndex - b.sceneIndex,
        );
        let offset = 0;
        const sceneAudioInfos: { narration: string; audioPath: string; offsetSeconds: number }[] = [];
        for (const asset of sortedAssets) {
          const scene = project.breakdown.scenes[asset.sceneIndex];
          if (!scene) continue;
          if (asset.audioPath) {
            sceneAudioInfos.push({
              narration: scene.narration,
              audioPath: asset.audioPath,
              offsetSeconds: offset,
            });
          }
          offset += scene.durationSeconds;
        }

        if (sceneAudioInfos.length > 0) {
          const assContent = await generateASS(sceneAudioInfos);
          subtitlesPath = path.join(projectDir, "subtitles.ass");
          await fs.promises.writeFile(subtitlesPath, assContent);
          logger.info("Subtitles generated");
        }
      } catch (error) {
        logger.warn("Subtitle generation failed, continuing without subtitles", error);
      }

      // Step 4: Assemble final video
      logger.info("Assembling final video...");
      const outputPath = path.join(projectDir, "output.mp4");
      project.outputPath = await assembleVideo(
        project.breakdown,
        project.assets,
        outputPath,
        this.config.aspectRatio,
        subtitlesPath,
        this.config.music,
      );

      // Step 5: Generate YouTube upload metadata
      try {
        logger.info("Generating YouTube metadata...");
        const metadata = await generateYouTubeMetadata(script, project.breakdown);
        await fs.promises.writeFile(
          path.join(projectDir, "upload.json"),
          JSON.stringify(metadata, null, 2),
        );
        logger.info("YouTube metadata saved to upload.json");
      } catch (metadataError) {
        logger.warn("YouTube metadata generation failed, continuing without it", metadataError);
      }

      project.status = "complete";
      logger.info(`Video complete: ${project.outputPath}`);
    } catch (error) {
      project.status = "error";
      project.error =
        error instanceof Error ? error.message : String(error);
      logger.error("Pipeline failed", error);
    }

    // Save project metadata
    await fs.promises.writeFile(
      path.join(projectDir, "project.json"),
      JSON.stringify(project, null, 2),
    );

    return project;
  }

  private async generateAllAssets(
    breakdown: SceneBreakdown,
    projectDir: string,
  ): Promise<GeneratedAssets[]> {
    // Cap at 3 concurrent scenes to respect ElevenLabs' concurrent request limit
    const CONCURRENCY = 3;
    const scenes = breakdown.scenes;
    const results: PromiseSettledResult<GeneratedAssets>[] = [];

    for (let i = 0; i < scenes.length; i += CONCURRENCY) {
      const batch = scenes.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((scene) => this.generateSceneAssets(scene.index, scene, projectDir)),
      );
      results.push(...batchResults);
    }

    const assets: GeneratedAssets[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        assets.push(result.value);
      } else {
        logger.error("Scene generation failed", result.reason);
      }
    }

    return assets;
  }

  private async generateSceneAssets(
    index: number,
    scene: { imagePrompt: string; videoPrompt: string; narration: string; durationSeconds: number },
    projectDir: string,
  ): Promise<GeneratedAssets> {
    const assets: GeneratedAssets = { sceneIndex: index };

    // Generate image, video, and audio in parallel
    const [imageResult, audioResult] = await Promise.allSettled([
      // Image generation
      (async () => {
        const imagePath = path.join(projectDir, `scene_${index}.png`);
        if (fs.existsSync(imagePath)) {
          logger.info(`Scene ${index} image already exists, skipping`);
          assets.imagePath = imagePath;
        } else {
          logger.info(`Generating image for scene ${index}...`);
          assets.imagePath = await this.adapters.image.generate(
            scene.imagePrompt,
            imagePath,
            this.config.aspectRatio,
          );
          logger.info(`Scene ${index} image done`);
        }
      })(),

      // TTS generation
      (async () => {
        const audioPath = path.join(projectDir, `scene_${index}.mp3`);
        if (fs.existsSync(audioPath)) {
          logger.info(`Scene ${index} audio already exists, skipping`);
          assets.audioPath = audioPath;
        } else {
          logger.info(`Generating audio for scene ${index}...`);
          assets.audioPath = await this.adapters.tts.generate(
            scene.narration,
            audioPath,
            this.config.voice,
          );
          logger.info(`Scene ${index} audio done`);
        }
      })(),
    ]);

    if (imageResult.status === "rejected") {
      logger.error(`Scene ${index} image failed`, imageResult.reason);
    }
    if (audioResult.status === "rejected") {
      logger.error(`Scene ${index} audio failed`, audioResult.reason);
    }

    // Video generation (can use image as reference if available)
    const videoPath = path.join(projectDir, `scene_${index}.mp4`);
    if (fs.existsSync(videoPath)) {
      logger.info(`Scene ${index} video already exists, skipping`);
      assets.videoPath = videoPath;
    } else {
      try {
        logger.info(`Generating video for scene ${index}...`);
        assets.videoPath = await this.adapters.video.generate(
          scene.videoPrompt,
          assets.imagePath,
          scene.durationSeconds,
          videoPath,
          this.config.aspectRatio,
        );
        logger.info(`Scene ${index} video done`);
      } catch (error) {
        logger.warn(
          `Scene ${index} video failed, will use image fallback`,
          error,
        );
      }
    }

    return assets;
  }
}

function nextSequentialDir(outputDir: string, title: string): string {
  let existing: string[] = [];
  try {
    existing = fs.readdirSync(outputDir).filter((d) => /^\d{3}_/.test(d));
  } catch {
    // outputDir doesn't exist yet — will be created later
  }
  const maxNum = existing.reduce((max, d) => {
    const n = parseInt(d.slice(0, 3), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  const num = String(maxNum + 1).padStart(3, "0");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return path.join(outputDir, `${num}_${slug}`);
}
