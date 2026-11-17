import { ImageImportError } from "./contracts.ts";
import type { ImageBinding, ImageInfo } from "./contracts.ts";

const MAX_DOWNLOAD = 10_000_000;
const TARGET_BYTES = 50_000;
const MAX_BYTES = 100_000;

export function sourceUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 4096)
    throw new ImageImportError("Enter an HTTP or HTTPS image URL.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ImageImportError("Enter an HTTP or HTTPS image URL.");
  }
  const host = url.hostname.toLowerCase();
  // Reject all literal IPs (including normalized hexadecimal IPv4 and IPv6),
  // local names, credentials, and nonstandard ports before any network request.
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    /\.(localhost|local|internal|test|invalid|example|home|lan|arpa)\.?$/.test(
      host,
    ) ||
    host.endsWith(".")
  )
    throw new ImageImportError(
      "Use a public HTTP or HTTPS image URL without credentials.",
    );

  url.hash = "";
  return url;
}

export async function limitedBytes(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new ImageImportError("The image exceeds the size limit.");
  }
  if (!response.body) throw new ImageImportError("The image is empty.");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit)
        throw new ImageImportError("The image exceeds the size limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function publicAddress(address: string): boolean {
  if (address.includes(":")) {
    // Only global unicast IPv6; excludes mapped IPv4, link-local, ULA, loopback.
    return (
      /^[23][0-9a-f]{0,3}:/i.test(address) &&
      !/^2001:(db8|0|10|20):/i.test(address) &&
      !/^2002:/i.test(address)
    );
  }
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  const [a, b] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  );
}

async function checkPublicDns(
  host: string,
  signal: AbortSignal,
): Promise<void> {
  const results = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
        {
          headers: { accept: "application/dns-json" },
          signal,
        },
      );
      if (!response.ok)
        throw new ImageImportError("Could not resolve the image host.", 502);
      const result = (await response.json()) as {
        Status?: number;
        Answer?: { type: number; data: string }[];
      };
      if (result.Status !== 0)
        throw new ImageImportError("Could not resolve the image host.", 502);
      return (result.Answer ?? [])
        .filter((answer) => answer.type === 1 || answer.type === 28)
        .map((answer) => answer.data);
    }),
  );
  const addresses = results.flat();
  if (!addresses.length || addresses.some((address) => !publicAddress(address)))
    throw new ImageImportError(
      "The image host must resolve to public addresses.",
    );
}

export async function downloadImage(value: unknown): Promise<Uint8Array> {
  let url = sourceUrl(value);
  const signal = AbortSignal.timeout(15_000);
  for (let redirect = 0; redirect <= 4; redirect++) {
    await checkPublicDns(url.hostname, signal);
    // Never forward the app's authorization or cookies to an image provider.
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        accept: "image/*",
        "User-Agent": "Sleeve/1.0 (https://github.com/lukedigiovanna/sleeve)",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location)
        throw new ImageImportError("The image redirect is invalid.");
      url = sourceUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImageImportError(
        `The image provider returned HTTP ${response.status}. Try a different URL.`,
        502,
      );
    }
    return limitedBytes(response, MAX_DOWNLOAD);
  }
  throw new ImageImportError("The image has too many redirects.");
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function rasterInfo(info: ImageInfo): { width: number; height: number } {
  const { width, height } = info;
  if (
    !width ||
    !height ||
    width < 1 ||
    height < 1 ||
    width > 12000 ||
    height > 12000 ||
    width * height > 40_000_000 ||
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
    ].includes(info.format.toLowerCase())
  )
    throw new ImageImportError(
      "Use a JPEG, PNG, WebP, GIF, or AVIF image under 40 megapixels and 12,000 pixels per side.",
    );
  return { width, height };
}

export interface OptimizedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export async function optimizeImage(
  bytes: Uint8Array,
  images: ImageBinding,
): Promise<OptimizedImage> {
  rasterInfo(await images.info(stream(bytes)));
  let best: OptimizedImage | undefined;
  // Bound transformation work. Prefer quality before reducing resolution.
  for (const [dimension, quality] of [
    [768, 80],
    [768, 65],
    [640, 65],
    [512, 60],
    [384, 55],
  ]) {
    const result = await images
      .input(stream(bytes))
      .transform({ width: dimension!, height: dimension!, fit: "scale-down" })
      .output({ format: "image/webp", quality: quality!, anim: false });
    const response = result.response();
    if (!response.ok)
      throw new ImageImportError(
        "Image optimization is unavailable. Please retry.",
        502,
      );
    // Output is dimension-bounded; still cap buffering in case a service misbehaves.
    const output = await limitedBytes(response, 4_000_000);
    const outputInfo = await images.info(stream(output));
    const info = rasterInfo(outputInfo);
    if (
      outputInfo.format !== "image/webp" ||
      info.width > 768 ||
      info.height > 768
    )
      throw new ImageImportError(
        "Image optimization returned an invalid result.",
        502,
      );
    if (
      output.byteLength <= MAX_BYTES &&
      (!best || output.byteLength < best.bytes.byteLength)
    )
      best = { bytes: output, ...info };
    if (output.byteLength <= TARGET_BYTES) return best!;
  }
  if (!best)
    throw new ImageImportError(
      "Could not fit this image within 100 KB. Try a simpler or smaller image.",
    );
  return best;
}
