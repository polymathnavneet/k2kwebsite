import { env } from "cloudflare:workers";

/**
 * A bridge between the database and this repository.
 *
 * The database stays the thing the live site reads, because it has to handle
 * messages arriving at any moment. But every piece of content is also mirrored
 * to plain JSON files in `data/`, and can be pulled back out of them. That is
 * what lets a person - or an assistant like Claude or ChatGPT - open the repo,
 * edit `data/route.json`, and have the change reach the site.
 *
 * Set GITHUB_TOKEN in the hosting environment to switch this on. Without it the
 * site works exactly as before; the mirror simply does nothing.
 */

const API = "https://api.github.com";

export const DATA_FILES = {
  route: "data/route.json",
  messages: "data/messages.json",
  book: "data/book.json",
  journey: "data/journey.json",
} as const;

export type DataFile = keyof typeof DATA_FILES;

type Runtime = { GITHUB_TOKEN?: string; GITHUB_REPO?: string; GITHUB_BRANCH?: string };
const runtime = () => env as unknown as Runtime;

export const githubEnabled = () => Boolean(runtime().GITHUB_TOKEN?.trim());

const repo = () => runtime().GITHUB_REPO?.trim() || "polymathnavneet/k2kwebsite";
const branch = () => runtime().GITHUB_BRANCH?.trim() || "main";

function headers() {
  const value: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "a-long-walk",
  };
  const token = runtime().GITHUB_TOKEN?.trim();
  if (token) value.authorization = `Bearer ${token}`;
  return value;
}

// btoa/atob are byte-oriented, so text has to be encoded around them or any
// non-ASCII character (every "→" and every Devanagari name) is corrupted.
const encodeBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

/** Read one data file from the repository. Returns null if it is not there. */
export async function readData<T>(file: DataFile): Promise<{ data: T | null; sha: string | null }> {
  const url = `${API}/repos/${repo()}/contents/${DATA_FILES[file]}?ref=${encodeURIComponent(branch())}`;
  const response = await fetch(url, { headers: headers() });
  if (response.status === 404) return { data: null, sha: null };
  if (!response.ok) throw new Error(`GitHub read failed (${response.status})`);
  const payload = await response.json() as { content?: string; sha: string };
  return { data: JSON.parse(decodeBase64(payload.content ?? "")) as T, sha: payload.sha };
}

/**
 * Write one data file back to the repository.
 *
 * The commit carries [skip ci] because the site reads this content from the
 * database, not from the build - rebuilding on every message would only add
 * delay. Returns false rather than throwing: a failed mirror must never cost
 * someone their message.
 */
export async function writeData(file: DataFile, data: unknown, message: string): Promise<boolean> {
  if (!githubEnabled()) return false;
  try {
    const next = `${JSON.stringify(data, null, 2)}\n`;
    const { data: current, sha } = await readData<unknown>(file);
    if (current && `${JSON.stringify(current, null, 2)}\n` === next) return true; // nothing changed

    const response = await fetch(`${API}/repos/${repo()}/contents/${DATA_FILES[file]}`, {
      method: "PUT",
      headers: { ...headers(), "content-type": "application/json" },
      body: JSON.stringify({
        message: `${message} [skip ci]`,
        content: encodeBase64(next),
        branch: branch(),
        ...(sha ? { sha } : {}),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
