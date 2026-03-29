export type MediaCarouselItem = {
  url: string;
  title?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  assetId?: string | null;
};

export type MediaMeta = {
  subtitle?: string;
  items: MediaCarouselItem[];
};

export const MEDIA_META_PREFIX = "__media_meta_v1__:";

export function parseMediaMeta(caption: string | null | undefined, fallback: MediaCarouselItem): MediaMeta {
  if (caption && caption.startsWith(MEDIA_META_PREFIX)) {
    try {
      const parsed = JSON.parse(caption.slice(MEDIA_META_PREFIX.length));
      const items = Array.isArray(parsed?.items)
        ? parsed.items.filter((it: any) => typeof it?.url === "string" && it.url.length > 0)
        : [];
      if (items.length > 0) {
        return {
          subtitle: typeof parsed?.subtitle === "string" ? parsed.subtitle : "",
          items,
        };
      }
    } catch {
      // Ignore malformed metadata and fallback to legacy shape.
    }
  }

  return {
    subtitle: typeof caption === "string" && !caption.startsWith(MEDIA_META_PREFIX) ? caption : "",
    items: fallback.url ? [fallback] : [],
  };
}

export function buildMediaCaption(meta: MediaMeta): string {
  return `${MEDIA_META_PREFIX}${JSON.stringify({ subtitle: meta.subtitle || "", items: meta.items })}`;
}

export type UploadFileFn = (
  file: File,
  accessToken: string
) => Promise<{ key: string; url: string; isPrivate: boolean }>;

export async function uploadFilesAsMediaItems(params: {
  files: File[];
  accessToken: string | null | undefined;
  uploadFile: UploadFileFn;
  onUploadError?: (error: unknown, file: File) => void;
  allowLocalBlobFallback?: boolean;
}): Promise<MediaCarouselItem[]> {
  const {
    files,
    accessToken,
    uploadFile,
    onUploadError,
    allowLocalBlobFallback = true,
  } = params;

  const uploadedItems: MediaCarouselItem[] = [];

  for (const file of files) {
    let uploadedUrl = "";
    let uploadedKey: string | null = null;

    if (accessToken) {
      try {
        const uploaded = await uploadFile(file, accessToken);
        uploadedUrl = uploaded.url;
        uploadedKey = uploaded.key;
      } catch (error) {
        onUploadError?.(error, file);
        if (allowLocalBlobFallback) {
          uploadedUrl = URL.createObjectURL(file);
          uploadedKey = null;
        }
      }
    } else if (allowLocalBlobFallback) {
      uploadedUrl = URL.createObjectURL(file);
      uploadedKey = null;
    }

    if (!uploadedUrl) continue;

    uploadedItems.push({
      url: uploadedUrl,
      title: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size || null,
      assetId: uploadedKey,
    });
  }

  return uploadedItems;
}
