/**
 * KYRO — video uploads.
 *
 * Videos go into a PRIVATE Supabase Storage bucket. Creator work is licensed
 * to a brand for a campaign, so it must not sit on a public URL that keeps
 * working after the licence ends. Reading one means minting a signed URL,
 * which expires.
 *
 * Objects are keyed `<creator_id>/<uuid>.<ext>`. The first path segment is
 * what the storage RLS policy in migration 0007 checks, so the folder name
 * is load-bearing, not cosmetic.
 */

import { getSupabase } from './supabase';

export const SUBMISSIONS_BUCKET = 'submissions';

/** Matches the bucket's own limit, so we can fail early with a clear message. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

const ALLOWED = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']);

export interface UploadResult {
  path: string | null;
  error: string | null;
}

function extensionFor(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : '';
  if (fromName && /^[a-z0-9]{2,5}$/i.test(fromName)) return fromName.toLowerCase();
  if (file.type === 'video/quicktime') return 'mov';
  if (file.type === 'video/webm') return 'webm';
  return 'mp4';
}

/**
 * Upload a video for a creator. Returns the storage path, not a URL, because
 * the bucket is private and a URL has to be signed at the moment of viewing.
 */
export async function uploadSubmissionVideo(creatorId: string, file: File): Promise<UploadResult> {
  const sb = getSupabase();
  if (!sb) return { path: null, error: 'Uploads are unavailable in this build.' };

  if (!ALLOWED.has(file.type)) {
    return { path: null, error: 'Upload an MP4, MOV or WebM video.' };
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return { path: null, error: 'That file is over 500 MB. Export a smaller version and try again.' };
  }

  const path = `${creatorId}/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error } = await sb.storage.from(SUBMISSIONS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    // The most common cause by far is the bucket or its policies not existing
    // yet, which reads as a permission error rather than a missing bucket.
    return { path: null, error: error.message || 'Upload failed. Try again.' };
  }
  return { path, error: null };
}

/**
 * Mint a temporary URL for playback. Defaults to one hour, which outlasts any
 * realistic review session without leaving a link that works forever.
 */
export async function signedVideoUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage
    .from(SUBMISSIONS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/* ─────────────────────────────────────────────────────────────
   Campaign covers
   ───────────────────────────────────────────────────────────── */

export const COVERS_BUCKET = 'campaign-covers';
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

const COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Upload a campaign cover and return its public URL.
 *
 * Unlike a submission video this bucket is public, so the URL is stable and
 * needs no signing. That matters because covers render in a grid: signing
 * each one would be a round trip per card.
 */
/** A brand's logo. Same bucket as covers: both are public brand imagery. */
export async function uploadBrandLogo(
  brandId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { url: null, error: 'Uploads are unavailable in this build.' };

  if (!COVER_TYPES.has(file.type)) {
    return { url: null, error: 'Use a JPG, PNG or WebP image.' };
  }
  if (file.size > MAX_COVER_BYTES) {
    return { url: null, error: 'That image is over 5 MB. Export a smaller one.' };
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${brandId}/logo-${crypto.randomUUID()}.${ext}`;

  const { error } = await sb.storage.from(COVERS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { url: null, error: error.message || 'Upload failed. Try again.' };

  const { data } = sb.storage.from(COVERS_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl ?? null, error: null };
}

export async function uploadCampaignCover(
  brandId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  const sb = getSupabase();
  if (!sb) return { url: null, error: 'Uploads are unavailable in this build.' };

  if (!COVER_TYPES.has(file.type)) {
    return { url: null, error: 'Use a JPG, PNG or WebP image.' };
  }
  if (file.size > MAX_COVER_BYTES) {
    return { url: null, error: 'That image is over 5 MB. Export a smaller one.' };
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${brandId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await sb.storage.from(COVERS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { url: null, error: error.message || 'Upload failed. Try again.' };

  const { data } = sb.storage.from(COVERS_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl ?? null, error: null };
}
