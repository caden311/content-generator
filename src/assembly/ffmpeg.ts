import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "../utils/logger.js";
import type { GeneratedAssets, SceneBreakdown } from "../types/index.js";

const execFileAsync = promisify(execFile);

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function getMediaDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

const DIMENSIONS: Record<"16:9" | "9:16" | "1:1", { w: number; h: number }> = {
  "16:9": { w: 1920, h: 1080 },
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
};

export async function assembleVideo(
  breakdown: SceneBreakdown,
  assets: GeneratedAssets[],
  outputPath: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
  subtitlesPath?: string,
): Promise<string> {
  if (!(await ffmpegAvailable())) {
    throw new Error(
      "FFmpeg is not installed. Install it with: brew install ffmpeg",
    );
  }

  const outputDir = path.dirname(outputPath);
  await fs.promises.mkdir(outputDir, { recursive: true });

  // Sort assets by scene index
  const sorted = [...assets].sort((a, b) => a.sceneIndex - b.sceneIndex);

  // Step 1: Create video clips from images (if no video clips exist) or use video clips
  const clipPaths: string[] = [];

  for (const asset of sorted) {
    const scene = breakdown.scenes[asset.sceneIndex];
    if (!scene) continue;

    const clipPath = path.join(
      outputDir,
      `clip_${asset.sceneIndex}.mp4`,
    );

    if (asset.videoPath && fs.existsSync(asset.videoPath)) {
      // Use the generated video clip directly
      clipPaths.push(asset.videoPath);
    } else if (asset.imagePath && fs.existsSync(asset.imagePath)) {
      // Convert still image to video clip with Ken Burns effect
      await execFileAsync("ffmpeg", [
        "-y",
        "-loop", "1",
        "-i", asset.imagePath,
        "-c:v", "libx264",
        "-t", String(scene.durationSeconds),
        "-pix_fmt", "yuv420p",
        "-vf", `scale=${DIMENSIONS[aspectRatio].w}:${DIMENSIONS[aspectRatio].h}:force_original_aspect_ratio=decrease,pad=${DIMENSIONS[aspectRatio].w}:${DIMENSIONS[aspectRatio].h}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.001,1.3)':d=${scene.durationSeconds * 25}:s=${DIMENSIONS[aspectRatio].w}x${DIMENSIONS[aspectRatio].h}`,
        "-r", "25",
        clipPath,
      ]);
      clipPaths.push(clipPath);
    }
  }

  if (clipPaths.length === 0) {
    throw new Error("No video clips or images to assemble");
  }

  // Step 2: Concatenate all clips
  const concatListPath = path.join(outputDir, "concat.txt");
  const concatContent = clipPaths
    .map((p) => `file '${path.resolve(p)}'`)
    .join("\n");
  await fs.promises.writeFile(concatListPath, concatContent);

  const concatenatedPath = path.join(outputDir, "concatenated.mp4");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatListPath,
    "-c", "copy",
    concatenatedPath,
  ]);

  // Step 3: Merge audio tracks
  const audioPaths = sorted
    .map((a) => a.audioPath)
    .filter((p): p is string => p !== undefined && fs.existsSync(p));

  let finalAudioPath: string | null = null;

  if (audioPaths.length > 0) {
    // Concatenate all audio segments
    const audioListPath = path.join(outputDir, "audio_concat.txt");
    const audioContent = audioPaths
      .map((p) => `file '${path.resolve(p)}'`)
      .join("\n");
    await fs.promises.writeFile(audioListPath, audioContent);

    finalAudioPath = path.join(outputDir, "voiceover.mp3");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", audioListPath,
      "-c", "copy",
      finalAudioPath,
    ]);
  }

  // Step 4: Combine video + audio (and burn in subtitles if provided)
  if (finalAudioPath) {
    const videoDuration = await getMediaDuration(concatenatedPath);
    const audioDuration = await getMediaDuration(finalAudioPath);
    const duration = String(Math.min(videoDuration, audioDuration));

    let subtitlesBurned = false;
    if (subtitlesPath && fs.existsSync(subtitlesPath)) {
      try {
        await execFileAsync("ffmpeg", [
          "-y",
          "-i", concatenatedPath,
          "-i", finalAudioPath,
          "-c:v", "libx264",
          "-preset", "medium",
          "-crf", "18",
          "-vf", `ass=filename=${path.resolve(subtitlesPath)}`,
          "-c:a", "aac",
          "-b:a", "192k",
          "-t", duration,
          outputPath,
        ]);
        subtitlesBurned = true;
      } catch (err: any) {
        if (err?.stderr?.includes("No such filter")) {
          logger.warn("ffmpeg built without libass — subtitles skipped. Fix: brew install libass && brew reinstall ffmpeg");
        } else {
          throw err;
        }
      }
    }
    if (!subtitlesBurned) {
      // No subtitles (or subtitle burn failed) — copy video stream as-is
      await execFileAsync("ffmpeg", [
        "-y",
        "-i", concatenatedPath,
        "-i", finalAudioPath,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", duration,
        outputPath,
      ]);
    }
  } else {
    // No audio — just copy the concatenated video
    await fs.promises.copyFile(concatenatedPath, outputPath);
  }

  // Cleanup temp files
  const tempFiles = [concatListPath, concatenatedPath];
  if (finalAudioPath) {
    tempFiles.push(
      path.join(outputDir, "audio_concat.txt"),
      finalAudioPath,
    );
  }
  for (const f of tempFiles) {
    await fs.promises.unlink(f).catch(() => {});
  }

  logger.info(`Assembled final video: ${outputPath}`);
  return outputPath;
}
