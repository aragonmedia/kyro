/**
 * Kyro — Legal document content
 *
 * The Privacy Policy and Terms of Service are imported straight from the
 * markdown in `docs/legal/` rather than duplicated as JSX. That keeps one
 * source of truth: the files a lawyer reviews are the files the site serves,
 * so the published pages can never quietly drift from the reviewed text.
 *
 * The `?raw` suffix is Vite's raw-import, so the markdown ships as a string
 * and is rendered at runtime by `lib/markdown.tsx`.
 */

import privacyRaw from '../../docs/legal/PRIVACY_POLICY.md?raw';
import termsRaw from '../../docs/legal/TERMS_OF_SERVICE.md?raw';

/** Drop the internal HTML comment header (drafting notes, placeholder list). */
function stripInternalNotes(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '').trimStart();
}

export const PRIVACY_POLICY_MD = stripInternalNotes(privacyRaw);
export const TERMS_OF_SERVICE_MD = stripInternalNotes(termsRaw);

/** True while the documents still contain unfilled placeholders. */
export function hasUnfilledPlaceholders(md: string): boolean {
  return /\[[A-Z_]{3,}\]/.test(md);
}
