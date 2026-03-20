import OpenAI from "openai";
import { config } from "../../config/index.js";
import type { TTSAdapter } from "../../types/index.js";
import * as fs from "node:fs";

export class OpenAITTSAdapter implements TTSAdapter {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: config.openaiApiKey() });
  }

  async generate(
    text: string,
    outputPath: string,
    voice?: string,
  ): Promise<string> {
    const response = await this.client.audio.speech.create({
      model: "tts-1",
      voice: (voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer") ?? "nova",
      input: text,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(outputPath, buffer);
    return outputPath;
  }
}
