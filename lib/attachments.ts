// Client-side attachment validation, image downscaling, and a tiny
// data-URL text decoder. Used by ChatInterface for the paste / drop /
// file-picker pipelines so the UI stays responsive and oversized
// uploads are rejected before they ever reach the server.

export const ATTACHMENT_LIMITS = {
  // Per file (after image downscaling) — 5 MB.
  maxFileBytes: 5 * 1024 * 1024,
  // Maximum simultaneous files a single submit can carry.
  maxFiles: 5,
  // Total bytes across all staged files. Keeps the encoded request body
  // well under Vercel's 4.5 MB Hobby limit even after base64 inflation.
  maxTotalBytes: 8 * 1024 * 1024,
  // Long-edge cap for image downscaling.
  maxImageDim: 2048,
} as const;

export type Rejection = { name: string; reason: string };
export type AcceptResult = { ok: File[]; rejected: Rejection[] };

function isAllowedType(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("text/");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

// Resize an image to ≤ maxImageDim on the long edge and re-encode at
// quality 0.85. PNG sources stay PNG (alpha preserved); everything else
// becomes JPEG. If the re-encoded blob isn't smaller AND the original
// fits the dimension cap, the original file is returned unchanged.
async function downscaleImageIfNeeded(file: File): Promise<File> {
  // SVG and tiny binaries — skip the canvas trip entirely.
  if (file.type === "image/svg+xml") return file;
  const trivialSize = file.size < 256 * 1024;
  if (trivialSize && file.size <= ATTACHMENT_LIMITS.maxFileBytes) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }

  const { maxImageDim } = ATTACHMENT_LIMITS;
  const tooLarge = img.naturalWidth > maxImageDim || img.naturalHeight > maxImageDim;
  if (!tooLarge && file.size <= ATTACHMENT_LIMITS.maxFileBytes) {
    URL.revokeObjectURL(img.src);
    return file;
  }

  const scale = tooLarge
    ? Math.min(maxImageDim / img.naturalWidth, maxImageDim / img.naturalHeight)
    : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(img.src);
    return file;
  }
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);

  const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outType, 0.85)
  );
  if (!blob) return file;
  // Re-encoding sometimes inflates a small JPEG. Only swap if we
  // actually saved bytes, OR we had to resize (in which case keeping
  // the original would defeat the dim cap).
  if (!tooLarge && blob.size >= file.size) return file;

  const ext = outType === "image/png" ? "png" : "jpg";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.${ext}`, {
    type: outType,
    lastModified: file.lastModified,
  });
}

// Validate, optionally downscale images, and partition into
// accepted / rejected. The caller decides what to do with rejected
// (typically a single toast that lists each rejection's reason).
export async function acceptFiles(raw: File[]): Promise<AcceptResult> {
  const ok: File[] = [];
  const rejected: Rejection[] = [];
  let total = 0;

  const { maxFiles, maxFileBytes, maxTotalBytes } = ATTACHMENT_LIMITS;
  const fileSizeMb = (maxFileBytes / 1024 / 1024).toFixed(0);
  const totalSizeMb = (maxTotalBytes / 1024 / 1024).toFixed(0);

  for (const f of raw) {
    const displayName = f.name || "(未命名)";

    if (!isAllowedType(f)) {
      rejected.push({ name: displayName, reason: "类型不支持" });
      continue;
    }
    if (ok.length >= maxFiles) {
      rejected.push({ name: displayName, reason: `最多 ${maxFiles} 个` });
      continue;
    }

    let candidate = f;
    if (f.type.startsWith("image/")) {
      try {
        candidate = await downscaleImageIfNeeded(f);
      } catch {
        candidate = f;
      }
    }

    if (candidate.size > maxFileBytes) {
      rejected.push({ name: displayName, reason: `单个超过 ${fileSizeMb}MB` });
      continue;
    }
    if (total + candidate.size > maxTotalBytes) {
      rejected.push({ name: displayName, reason: `累计超过 ${totalSizeMb}MB` });
      continue;
    }

    ok.push(candidate);
    total += candidate.size;
  }

  return { ok, rejected };
}

export function getTextFromDataUrl(dataUrl: string): string {
  const base64 = dataUrl.split(",")[1] ?? "";
  try {
    return window.atob(base64);
  } catch {
    return "";
  }
}
