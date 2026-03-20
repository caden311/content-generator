import { config } from "../../config/index.js";
import type { ImageAdapter } from "../../types/index.js";
import { downloadFile } from "../../utils/download.js";
import { pollFalQueue } from "../../utils/poll.js";

interface FalQueueResponse {
  request_id: string;
  status_url: string;
  response_url: string;
}

interface FalImageResult {
  images: Array<{ url: string }>;
}

export class FalFluxImageAdapter implements ImageAdapter {
  private model: string;

  constructor(model: "schnell" | "pro" = "schnell") {
    this.model = model === "pro" ? "fal-ai/flux-pro/v1.1" : "fal-ai/flux/schnell";
  }

  async generate(prompt: string, outputPath: string, aspectRatio: "16:9" | "9:16" | "1:1"): Promise<string> {
    const sizeMap = {
      "16:9": "landscape_16_9",
      "9:16": "portrait_16_9",
      "1:1": "square_hd",
    } as const;

    const response = await fetch(`https://queue.fal.run/${this.model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${config.falApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        image_size: sizeMap[aspectRatio],
        num_images: 1,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`fal.ai image generation failed: ${response.status} ${error}`);
    }

    const { status_url, response_url } = (await response.json()) as FalQueueResponse;
    const headers = {
      Authorization: `Key ${config.falApiKey()}`,
    };
    const data = await pollFalQueue<FalImageResult>(
      status_url,
      response_url,
      headers,
    );
    const imageUrl = data.images[0]?.url;
    if (!imageUrl) {
      throw new Error("No image URL in fal.ai response");
    }

    await downloadFile(imageUrl, outputPath);
    return outputPath;
  }
}
