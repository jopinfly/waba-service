import { put, del, list } from "@vercel/blob";
import { whatsappClient } from "../whatsapp/client";
import { saveMediaFile, getMediaByWaId } from "../db/queries";

export async function downloadAndStoreMedia(
  waMediaId: string,
  mimeType: string,
  messageId?: string,
  filename?: string
): Promise<string> {
  const existing = await getMediaByWaId(waMediaId);
  if (existing) return existing.blobUrl;

  const mediaInfo = await whatsappClient.getMediaUrl(waMediaId);
  const mediaBuffer = await whatsappClient.downloadMedia(mediaInfo.url);

  const ext = getExtensionFromMime(mimeType);
  const blobFilename = filename || `${waMediaId}.${ext}`;
  const pathname = `whatsapp-media/${new Date().toISOString().slice(0, 10)}/${blobFilename}`;

  const blob = await put(pathname, Buffer.from(mediaBuffer), {
    access: "public",
    contentType: mimeType,
  });

  await saveMediaFile({
    messageId,
    waMediaId,
    mimeType,
    blobUrl: blob.url,
    filename: blobFilename,
    sizeBytes: mediaBuffer.byteLength,
  });

  return blob.url;
}

export async function deleteMediaFile(blobUrl: string): Promise<void> {
  await del(blobUrl);
}

export async function listMediaFiles(prefix?: string) {
  return list({ prefix: prefix || "whatsapp-media/" });
}

function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/amr": "amr",
    "audio/ogg": "ogg",
    "application/pdf": "pdf",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
  };
  return map[mimeType] || "bin";
}
