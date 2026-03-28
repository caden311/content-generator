import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { MusicMood, MusicOptions } from "../types/index.js";

const MUSIC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/music",
);

const MOODS: MusicMood[] = ["calm", "epic", "upbeat", "focus"];

export function resolveMusicPath(track: MusicMood | string): string {
  if (MOODS.includes(track as MusicMood)) {
    return path.join(MUSIC_DIR, `${track}.mp3`);
  }
  return path.resolve(track);
}

export function musicAvailable(opts: MusicOptions): string | null {
  const resolved = resolveMusicPath(opts.track);
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}
