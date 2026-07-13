/**
 * Helpers for turning an on-page <img> thumbnail into the base64 payload
 * Gemini Vision expects. Runs inside the content script, which has DOM
 * access to the actual rendered thumbnail image element.
 */

export interface ImagePayload {
  base64: string;
  mimeType: string;
}

/**
 * Draws an already-loaded <img> element onto an offscreen canvas and reads
 * it back out as base64. Works for same-origin and CORS-enabled Shutterstock
 * CDN thumbnails; if the canvas is tainted (opaque CORS image), falls back
 * to fetching the image URL directly via the content script's fetch (which
 * runs with the page's origin permissions).
 */
export async function imageElementToBase64(
  img: HTMLImageElement,
  maxDimension = 1024
): Promise<ImagePayload | null> {
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      maxDimension / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
    );
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("imageElementToBase64: No 2D context");
      return null;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/png" };
  } catch (err) {
    console.error("imageElementToBase64: canvas failed, trying fetch fallback. Error:", err);
    return fetchImageAsBase64(img.currentSrc || img.src);
  }
}

export async function fetchImageAsBase64(
  url: string
): Promise<ImagePayload | null> {
  try {
    if (!url) {
      console.error("fetchImageAsBase64: url is empty");
      return null;
    }

    // Try without credentials first. CDNs often allow CORS but reject requests with credentials.
    let response = await fetch(url, { mode: "cors" }).catch((e) => {
      console.warn("fetchImageAsBase64: fetch without credentials failed", e);
      return null;
    });

    if (!response || !response.ok) {
      // Fallback to with credentials if the first attempt failed (e.g. protected asset)
      response = await fetch(url, { credentials: "include" }).catch((e) => {
        console.error("fetchImageAsBase64: fetch with credentials failed", e);
        return null;
      });
    }

    if (!response || !response.ok) {
      console.error(`fetchImageAsBase64: all fetch attempts failed for url: ${url}`);
      return null;
    }

    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    return { base64, mimeType: blob.type || "image/png" };
  } catch (err) {
    console.error("fetchImageAsBase64: error fetching or parsing blob:", err);
    return null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
