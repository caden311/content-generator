import * as fs from "node:fs";
import OpenAI from "openai";
import { config } from "../config/index.js";
import { logger } from "./logger.js";
import type { WordTimestamp } from "../types/index.js";

const client = new OpenAI({ apiKey: config.openaiApiKey() });

export async function transcribeAudio(
  audioPath: string,
): Promise<WordTimestamp[]> {
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const words = (response as any).words;
  if (!Array.isArray(words)) {
    logger.warn("Whisper returned no word-level timestamps");
    return [];
  }

  return words.map((w: any) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));
}

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

interface SceneAudioInfo {
  narration: string;
  audioPath: string;
  offsetSeconds: number;
}

export async function generateSRT(scenes: SceneAudioInfo[]): Promise<string> {
  const entries: { index: number; start: number; end: number; text: string }[] =
    [];
  let entryIndex = 1;

  for (const scene of scenes) {
    if (!fs.existsSync(scene.audioPath)) {
      logger.warn(`Audio not found for scene, skipping: ${scene.audioPath}`);
      continue;
    }

    const words = await transcribeAudio(scene.audioPath);
    if (words.length === 0) continue;

    // Group words into phrases of ~4 words
    const wordsPerGroup = 4;
    for (let i = 0; i < words.length; i += wordsPerGroup) {
      const group = words.slice(i, i + wordsPerGroup);
      const text = group.map((w) => w.word).join(" ");
      const start = group[0]!.start + scene.offsetSeconds;
      const end = group[group.length - 1]!.end + scene.offsetSeconds;

      entries.push({ index: entryIndex++, start, end, text });
    }
  }

  return entries
    .map(
      (e) =>
        `${e.index}\n${formatSRTTime(e.start)} --> ${formatSRTTime(e.end)}\n${e.text}\n`,
    )
    .join("\n");
}

export async function generateASS(scenes: SceneAudioInfo[]): Promise<string> {
  const lines: string[] = [];
  let entryIndex = 1;

  for (const scene of scenes) {
    if (!fs.existsSync(scene.audioPath)) {
      logger.warn(`Audio not found for scene, skipping: ${scene.audioPath}`);
      continue;
    }

    const words = await transcribeAudio(scene.audioPath);
    if (words.length === 0) continue;

    const wordsPerGroup = 4;
    for (let i = 0; i < words.length; i += wordsPerGroup) {
      const group = words.slice(i, i + wordsPerGroup);
      const text = group.map((w) => w.word).join(" ");
      const start = group[0]!.start + scene.offsetSeconds;
      const end = group[group.length - 1]!.end + scene.offsetSeconds;
      lines.push(`Dialogue: 0,${formatASSTime(start)},${formatASSTime(end)},Default,,0,0,0,,${text}`);
      entryIndex++;
    }
  }

  const header = `[Script Info]
ScriptType: v4.00+
Collisions: Normal

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  return `${header}\n${lines.join("\n")}\n`;
}
