import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";
import type { SceneBreakdown, YouTubeMetadata } from "../types/index.js";

const SYSTEM_PROMPT = `You are a YouTube SEO and AEO (Answer Engine Optimization) expert. Given a video script and scene breakdown, generate optimized YouTube upload metadata.

Return ONLY valid JSON matching this schema:
{
  "title": "SEO-optimized YouTube title (under 100 characters)",
  "description": "Full YouTube description with keywords, timestamps, and CTAs (1000-2000 characters)",
  "tags": ["tag1", "tag2", "..."]
}

Guidelines:
- Title: compelling, keyword-rich, under 100 characters. Front-load the primary keyword.
- Description: include a hook in the first 2 lines (shown before "Show more"), relevant keywords naturally woven in, a call to action (like/subscribe), and hashtags at the end.
- Tags: 15-30 tags covering broad and specific keywords, related topics, and common search queries.
- Optimize for both traditional search and AI answer engines (clear, factual, question-answering phrasing).`;

export async function generateYouTubeMetadata(
  script: string,
  breakdown: SceneBreakdown,
): Promise<YouTubeMetadata> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey() });

  const sceneNarrations = breakdown.scenes
    .map((s) => `Scene ${s.index + 1}: ${s.narration}`)
    .join("\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate YouTube upload metadata for this video.\n\nTitle: ${breakdown.title}\n\nFull Script:\n${script}\n\nScene Narrations:\n${sceneNarrations}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonStr = textBlock.text;
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1];
  }

  return JSON.parse(jsonStr.trim()) as YouTubeMetadata;
}
