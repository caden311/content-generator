import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config/index.js";
import type { LLMAdapter, SceneBreakdown } from "../../types/index.js";

const SYSTEM_PROMPT = `You are a video production assistant. Given a script, break it down into scenes for AI video generation.

Return ONLY valid JSON matching this schema:
{
  "title": "string — short title for the video",
  "scenes": [
    {
      "index": 0,
      "description": "what happens in this scene",
      "imagePrompt": "detailed prompt for generating a still image of this scene — include style, lighting, composition details",
      "videoPrompt": "detailed prompt for generating a video clip of this scene — describe motion, camera movement, action",
      "narration": "the voiceover text for this scene",
      "durationSeconds": 10
    }
  ],
  "totalDuration": 60
}

Guidelines:
- Each scene should be 5-15 seconds
- Image prompts should be highly detailed and visual
- Video prompts should describe motion and camera work
- Narration should be natural spoken language
- Aim for the total duration to match the natural pacing of the narration
- Keep scene count between 4-8 for a typical 1-minute video
{{MAX_DURATION_INSTRUCTION}}`;

export class ClaudeLLMAdapter implements LLMAdapter {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey() });
  }

  async breakdownScript(script: string, maxDurationSeconds?: number): Promise<SceneBreakdown> {
    const maxDurationInstruction = maxDurationSeconds !== undefined
      ? `- IMPORTANT: Total duration MUST NOT exceed ${maxDurationSeconds} seconds — trim scenes or reduce count to fit`
      : "";
    const systemPrompt = SYSTEM_PROMPT.replace("{{MAX_DURATION_INSTRUCTION}}", maxDurationInstruction);

    const message = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Break down this script into scenes for video generation:\n\n${script}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = textBlock.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      jsonStr = jsonMatch[1];
    }

    const breakdown = JSON.parse(jsonStr.trim()) as SceneBreakdown;

    if (!breakdown.scenes || breakdown.scenes.length === 0) {
      throw new Error("Scene breakdown returned no scenes");
    }

    return breakdown;
  }
}
