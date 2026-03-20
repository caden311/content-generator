export interface Scene {
  index: number;
  description: string;
  imagePrompt: string;
  videoPrompt: string;
  narration: string;
  durationSeconds: number;
}

export interface SceneBreakdown {
  title: string;
  scenes: Scene[];
  totalDuration: number;
}

export interface GeneratedAssets {
  sceneIndex: number;
  imagePath?: string;
  imageUrl?: string;
  videoPath?: string;
  videoUrl?: string;
  audioPath?: string;
  audioUrl?: string;
  subtitlesPath?: string;
}

export interface VideoProject {
  id: string;
  script: string;
  breakdown: SceneBreakdown;
  assets: GeneratedAssets[];
  outputPath?: string;
  status: "pending" | "processing" | "complete" | "error";
  error?: string;
  createdAt: Date;
}

export type ModelTier = "budget" | "standard" | "premium";

export interface GenerationConfig {
  modelTier: ModelTier;
  outputDir: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  resolution: "720p" | "1080p" | "4k";
  voice?: string;
  dryRun?: boolean;
}

// Adapter interfaces — any provider must implement these

export interface LLMAdapter {
  breakdownScript(script: string, maxDurationSeconds?: number): Promise<SceneBreakdown>;
}

export interface ImageAdapter {
  generate(prompt: string, outputPath: string, aspectRatio: "16:9" | "9:16" | "1:1"): Promise<string>;
}

export interface VideoAdapter {
  generate(
    prompt: string,
    imageRef: string | undefined,
    durationSeconds: number,
    outputPath: string,
    aspectRatio: "16:9" | "9:16" | "1:1",
  ): Promise<string>;
}

export interface TTSAdapter {
  generate(text: string, outputPath: string, voice?: string): Promise<string>;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
}
