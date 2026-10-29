/**
 * KYRO — signing, and reading back what was signed
 *
 * The browser's half of the signature flow. It sends a typed name and gets
 * back a path; it never produces the document, because a document a browser
 * produced is a document the browser could have written anything into.
 *
 * Reading a signed copy goes straight to storage under the reader's own
 * session. Migration 0038 gives the signer and an admin read access to that
 * bucket and nobody else, so the link below is minted by Supabase against
 * whatever the caller is actually allowed to see rather than against a
 * permission this file asserts.
 */

import { getSupabase } from './supabase';
import { AGREEMENTS, agreementPath, type AgreementDocType } from '../../shared/agreements';

export { AGREEMENTS, agreementPath };
export type { AgreementDocType };

const BUCKET = 'agreements';

/** A signed link lasts long enough to open and not long enough to pass on. */
const LINK_SECONDS = 300;

export interface SignResult {
  signedAt: string | null;
  documentPath: string | null;
  /** True when this version was already signed and nothing new was made. */
  alreadySigned: boolean;
  error: string | null;
}

export interface SignInput {
  docType: AgreementDocType;
  /** Required for a brand document. Ignored for a creator one. */
  brandId?: string;
  signerName: string;
  signerTitle?: string;
  signerEmail?: string;
  /** The entity being bound, when it differs from the display name. */
  legalEntityName?: string;
}

const failed = (error: string): SignResult =>
  ({ signedAt: null, documentPath: null, alreadySigned: false, error });

export async function signAgreement(input: SignInput): Promise<SignResult> {
  const sb = getSupabase();
  if (!sb) return failed('This build has no Supabase connection, so signing is disabled.');

  const { data, error } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) return failed('Your session has expired. Sign in again and retry.');

  let res: Response;
  try {
    res = await fetch('/api/agreements/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  } catch {
    return failed('Could not reach KYRO. Check your connection and try again.');
  }

  let body: { signedAt?: string; documentPath?: string; alreadySigned?: boolean; error?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!res.ok) return failed(body.error || `Could not record your signature (${res.status}).`);

  return {
    signedAt: body.signedAt ?? null,
    documentPath: body.documentPath ?? null,
    alreadySigned: Boolean(body.alreadySigned),
    error: null,
  };
}

/**
 * A temporary link to a signed copy.
 *
 * Returns null rather than throwing when the reader is not allowed to see it,
 * because the caller is a button and the honest thing for a button to do is
 * not appear.
 */
export async function signedCopyUrl(documentPath: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(documentPath, LINK_SECONDS);
  if (error) {
    console.error('[kyro] could not sign a link to the agreement', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Opens a signed copy in a new tab, or reports why it could not. */
export async function openSignedCopy(documentPath: string): Promise<string | null> {
  const url = await signedCopyUrl(documentPath);
  if (!url) return 'That document could not be opened. It may have moved.';
  window.open(url, '_blank', 'noopener,noreferrer');
  return null;
}

/** Has this subject signed the current version of this document? */
export async function hasSigned(
  docType: AgreementDocType,
  subject: { brandId?: string; userId?: string }
): Promise<{ signedAt: string | null; documentPath: string | null }> {
  const sb = getSupabase();
  if (!sb) return { signedAt: null, documentPath: null };

  const doc = AGREEMENTS[docType];
  let query = sb
    .from('agreements')
    .select('signed_at, document_path')
    .eq('doc_type', docType)
    .eq('version', doc.version)
    .limit(1);

  query = doc.subject === 'brand'
    ? query.eq('brand_id', subject.brandId ?? '')
    : query.eq('user_id', subject.userId ?? '');

  /* Wrapped because the caller is a panel that has to render either way. An
     unreachable database should show the form, not a spinner that never
     resolves. */
  try {
    const { data, error } = await query.maybeSingle();
    if (error || !data) return { signedAt: null, documentPath: null };

    const row = data as { signed_at?: string; document_path?: string | null };
    return { signedAt: row.signed_at ?? null, documentPath: row.document_path ?? null };
  } catch {
    return { signedAt: null, documentPath: null };
  }
}
