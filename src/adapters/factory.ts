import type {
  ImageAdapter,
  LLMAdapter,
  ModelTier,
  TTSAdapter,
  VideoAdapter,
} from "../types/index.js";
import { ClaudeLLMAdapter } from "./llm/claude.js";
import { FalFluxImageAdapter } from "./image/fal-flux.js";
import { DalleImageAdapter } from "./image/openai-dalle.js";
import { FalKlingVideoAdapter } from "./video/fal-kling.js";
import { ElevenLabsTTSAdapter } from "./tts/elevenlabs.js";
import { OpenAITTSAdapter } from "./tts/openai-tts.js";

export interface AdapterSet {
  llm: LLMAdapter;
  image: ImageAdapter;
  video: VideoAdapter;
  tts: TTSAdapter;
}

export function createAdapters(tier: ModelTier): AdapterSet {
  switch (tier) {
    case "budget":
      return {
        llm: new ClaudeLLMAdapter(),
        image: new FalFluxImageAdapter("schnell"),
        video: new FalKlingVideoAdapter(),
        tts: new OpenAITTSAdapter(),
      };
    case "standard":
      return {
        llm: new ClaudeLLMAdapter(),
        image: new FalFluxImageAdapter("schnell"),
        video: new FalKlingVideoAdapter(),
        tts: new ElevenLabsTTSAdapter(),
      };
    case "premium":
      return {
        llm: new ClaudeLLMAdapter(),
        image: new DalleImageAdapter(),
        video: new FalKlingVideoAdapter(), // Swap for Sora adapter when available
        tts: new ElevenLabsTTSAdapter(),
      };
  }
}
