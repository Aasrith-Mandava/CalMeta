import { z } from 'zod';

// Muse Spark over an OpenAI-compatible Chat Completions endpoint. Defaults target
// Eden AI's hosted Muse Spark; point MUSE_BASE_URL / MUSE_MODEL at another provider
// (e.g. Together or Fireworks for `muse-spark-open`) without touching code.

const API_KEY = process.env.MUSE_API_KEY;
const BASE_URL = (process.env.MUSE_BASE_URL || 'https://api.edenai.run/v3').replace(/\/$/, '');
export const MODEL = process.env.MUSE_MODEL || 'muse-spark-1.3';
const TIMEOUT_MS = 20_000;

/**
 * AI is optional in local dev: with no key every feature returns its
 * template fallback, so teammates can run the app without credentials.
 */
export const aiEnabled = Boolean(API_KEY);

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * One structured call. Resolves to data matching `schema`, or null when AI is off,
 * the request fails, or the reply isn't valid JSON for the schema, so callers
 * always have a fallback path.
 */
export async function generate<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
}): Promise<z.infer<S> | null> {
  if (!aiEnabled) return null;
  const jsonSchema = JSON.stringify(z.toJSONSchema(opts.schema));
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `${opts.system}\n\nReply with only a JSON object matching this JSON Schema, no prose:\n${jsonSchema}`,
          },
          { role: 'user', content: opts.prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[ai] ${res.status} from ${BASE_URL}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const content = ((await res.json()) as ChatCompletion).choices?.[0]?.message?.content ?? '';
    const parsed = opts.schema.safeParse(extractJson(content));
    if (!parsed.success) {
      console.warn('[ai] reply did not match schema; using fallback', content.slice(0, 200));
      return null;
    }
    return parsed.data;
  } catch (err) {
    console.warn('[ai] request failed; using fallback', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Pulls the JSON object out of a reply that may be wrapped in prose or ``` fences. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const memo = new Map<string, { value: unknown; expires: number }>();

/** Memoize per key so page loads don't each wait on (or pay for) a model call. */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  memo.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}
