import OpenAI from "openai";
import { config } from "../../config/index.js";
import type { ImageAdapter } from "../../types/index.js";
import { downloadFile } from "../../utils/download.js";

export class DalleImageAdapter implements ImageAdapter {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: config.openaiApiKey() });
  }

  async generate(prompt: string, outputPath: string, aspectRatio: "16:9" | "9:16" | "1:1"): Promise<string> {
    const sizeMap = {
      "16:9": "1792x1024",
      "9:16": "1024x1792",
      "1:1": "1024x1024",
    } as const;

    const response = await this.client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: sizeMap[aspectRatio],
      quality: "standard",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error("No image URL in DALL-E response");
    }

    await downloadFile(imageUrl, outputPath);
    return outputPath;
  }
}
