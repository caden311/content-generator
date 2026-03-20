import { execSync } from "node:child_process";
import type { AdapterSet } from "./factory.js";
import type {
  ImageAdapter,
  LLMAdapter,
  SceneBreakdown,
  TTSAdapter,
  VideoAdapter,
} from "../types/index.js";

class DryRunLLMAdapter implements LLMAdapter {
  breakdownScript(_script: string, _maxDurationSeconds?: number): Promise<SceneBreakdown> {
    return Promise.resolve({
      title: "dry-run-test",
      totalDuration: 10,
      scenes: [
        { index: 0, description: "Scene 1", imagePrompt: "test", videoPrompt: "test", narration: "This is a test.", durationSeconds: 5 },
        { index: 1, description: "Scene 2", imagePrompt: "test", videoPrompt: "test", narration: "Dry run complete.", durationSeconds: 5 },
      ],
    });
  }
}

class DryRunImageAdapter implements ImageAdapter {
  generate(_prompt: string, outputPath: string, aspectRatio: "16:9" | "9:16" | "1:1"): Promise<string> {
    const [w, h] = aspectRatio === "9:16" ? [360, 640] : aspectRatio === "1:1" ? [360, 360] : [640, 360];
    execSync(`ffmpeg -y -f lavfi -i color=c=0x336699:s=${w}x${h}:d=1 -frames:v 1 "${outputPath}"`, { stdio: "pipe" });
    return Promise.resolve(outputPath);
  }
}

class DryRunTTSAdapter implements TTSAdapter {
  generate(_text: string, outputPath: string, _voice?: string): Promise<string> {
    execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 3 -q:a 9 -acodec libmp3lame "${outputPath}"`, { stdio: "pipe" });
    return Promise.resolve(outputPath);
  }
}

class DryRunVideoAdapter implements VideoAdapter {
  generate(_prompt: string, _imageRef: string | undefined, _durationSeconds: number, outputPath: string, aspectRatio: "16:9" | "9:16" | "1:1"): Promise<string> {
    const [w, h] = aspectRatio === "9:16" ? [360, 640] : aspectRatio === "1:1" ? [360, 360] : [640, 360];
    execSync(`ffmpeg -y -f lavfi -i color=c=0xcc3333:s=${w}x${h}:r=30 -t 5 "${outputPath}"`, { stdio: "pipe" });
    return Promise.resolve(outputPath);
  }
}

export function createDryRunAdapters(): AdapterSet {
  return {
    llm: new DryRunLLMAdapter(),
    image: new DryRunImageAdapter(),
    video: new DryRunVideoAdapter(),
    tts: new DryRunTTSAdapter(),
  };
}
