interface PollOptions {
  headers?: Record<string, string>;
  intervalMs?: number;
  maxAttempts?: number;
}

interface QueueStatus {
  status: string;
  [key: string]: unknown;
}

export async function pollForResult<T>(
  url: string,
  options: PollOptions = {},
): Promise<T> {
  const { headers = {}, intervalMs = 5000, maxAttempts = 120 } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 202) {
        // Still processing
        await sleep(intervalMs);
        continue;
      }
      const error = await response.text();
      throw new Error(`Poll request failed: ${response.status} ${error}`);
    }

    const data = (await response.json()) as QueueStatus;

    if (data.status === "COMPLETED" || data.status === "completed") {
      return data as T;
    }

    if (data.status === "FAILED" || data.status === "failed") {
      throw new Error(`Generation failed: ${JSON.stringify(data)}`);
    }

    // Still in progress
    await sleep(intervalMs);
  }

  throw new Error(`Polling timed out after ${maxAttempts} attempts`);
}

export async function pollFalQueue<T>(
  statusUrl: string,
  responseUrl: string,
  headers: Record<string, string>,
  intervalMs = 5000,
  maxAttempts = 120,
): Promise<T> {

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(statusUrl, { headers });
    if (!res.ok) throw new Error(`Status poll failed: ${res.status} ${await res.text()}`);
    const statusBody = (await res.json()) as { status: string; [key: string]: unknown };
    const { status } = statusBody;

    if (attempt > 0 && attempt % 12 === 0) {
      console.error(`[poll] ${statusUrl} — attempt ${attempt}, status: ${status}`);
    }

    if (status === "COMPLETED" || status === "completed") {
      const resultRes = await fetch(responseUrl, { headers });
      if (!resultRes.ok) {
        const errBody = await resultRes.text();
        throw new Error(`Result fetch failed: ${resultRes.status} ${errBody}`);
      }
      return resultRes.json() as Promise<T>;
    }
    if (status === "FAILED" || status === "failed") {
      throw new Error(`fal.ai job failed: ${statusUrl}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Polling timed out after ${maxAttempts} attempts`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
