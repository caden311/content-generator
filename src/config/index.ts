import "dotenv/config";
import type { GenerationConfig, ModelTier } from "../types/index.js";

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  anthropicApiKey: () => env("ANTHROPIC_API_KEY"),
  openaiApiKey: () => env("OPENAI_API_KEY"),
  falApiKey: () => env("FAL_KEY"),
  elevenLabsApiKey: () => env("ELEVENLABS_API_KEY"),
  redisUrl: () => env("REDIS_URL", "redis://localhost:6379"),
  outputDir: () => env("OUTPUT_DIR", "./output"),
} as const;

export function defaultGenerationConfig(
  overrides?: Partial<GenerationConfig>,
): GenerationConfig {
  return {
    modelTier: "standard" as ModelTier,
    outputDir: config.outputDir(),
    aspectRatio: "16:9",
    resolution: "1080p",
    ...overrides,
  };
}
