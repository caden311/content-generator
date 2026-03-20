import { config } from "../../config/index.js";
import type { VideoAdapter } from "../../types/index.js";
import { downloadFile } from "../../utils/download.js";
import { pollFalQueue } from "../../utils/poll.js";

interface FalQueueResponse {
  request_id: string;
  status_url: string;
  response_url: string;
}

interface FalVideoResult {
  video: { url: string };
}

const MODEL_ID = "fal-ai/kling-video/v2/master/text-to-video";

export class FalKlingVideoAdapter implements VideoAdapter {
  async generate(
    prompt: string,
    imageRef: string | undefined,
    durationSeconds: number,
    outputPath: string,
    aspectRatio: "16:9" | "9:16" | "1:1",
  ): Promise<string> {
    const body: Record<string, unknown> = {
      prompt,
      duration: (durationSeconds <= 5 ? 5 : 10) as 5 | 10,
      aspect_ratio: aspectRatio,
    };

    if (imageRef) {
      body.image_url = imageRef;
    }

    // Submit to queue
    const submitResponse = await fetch(`https://queue.fal.run/${MODEL_ID}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${config.falApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!submitResponse.ok) {
      const error = await submitResponse.text();
      throw new Error(`fal.ai video submit failed: ${submitResponse.status} ${error}`);
    }

    const submitBody = (await submitResponse.json()) as FalQueueResponse;
    const { status_url, response_url } = submitBody;

    // Poll for completion
    const result = await pollFalQueue<FalVideoResult>(
      status_url,
      response_url,
      { Authorization: `Key ${config.falApiKey()}` },
      5000,
      120, // 10 min max
    );

    if (!result.video?.url) {
      throw new Error("No video URL in fal.ai response");
    }

    await downloadFile(result.video.url, outputPath);
    return outputPath;
  }
}
