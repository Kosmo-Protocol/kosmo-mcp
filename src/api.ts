import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { BASE_URL } from "./config.js";

async function call(method: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(BASE_URL + path, { method, signal: AbortSignal.timeout(60_000), ...init });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) {
    const detail = typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300);
    if (res.status === 429) throw new Error(`Rate limited by Kosmo (429). Wait a minute and retry. ${detail}`);
    throw new Error(`Kosmo API ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return body;
}

const json = (body: unknown): RequestInit => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const getJson = (path: string) => call("GET", path);
export const postJson = (path: string, body: unknown) => call("POST", path, json(body));
export const putJson = (path: string, body: unknown) => call("PUT", path, json(body));

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

export async function uploadLogo(a: {
  chainId: number; token: string; timestamp: string; signature: string; filePath?: string; base64?: string; mimeType?: string;
}): Promise<unknown> {
  let bytes: Buffer; let mime: string; let name: string;
  if (a.filePath) {
    const ext = extname(a.filePath).toLowerCase();
    mime = MIME[ext] ?? "";
    if (!mime) throw new Error("Logo must be a png, jpg, jpeg, webp or gif file.");
    bytes = await readFile(a.filePath); name = basename(a.filePath);
  } else if (a.base64) {
    mime = a.mimeType ?? "";
    if (!Object.values(MIME).includes(mime)) throw new Error("mimeType must be image/png, image/jpeg, image/webp or image/gif.");
    bytes = Buffer.from(a.base64, "base64"); name = "logo." + mime.split("/")[1];
  } else throw new Error("Provide filePath or base64.");
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Logo is larger than 5 MB.");
  const form = new FormData();
  form.set("curveAddress", a.token.toLowerCase());
  form.set("timestamp", a.timestamp);
  form.set("signature", a.signature);
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), name);
  return call("POST", `/api/upload?chain=${a.chainId}`, { body: form });
}
