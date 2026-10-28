/**
 * POST /api/agreements/sign
 *
 * Takes a typed name and gives back a signed PDF.
 *
 * The work is small and the order matters: establish who is signing from
 * their own token rather than from the body, fetch the blank document from
 * the same public URL their browser rendered, hash those bytes, append a
 * signature page, store the result where only they and an admin can read it,
 * and record the row last, so a row with a document_path always has a
 * document behind it.
 *
 * Signing the same version twice is a double click, not a second agreement:
 * the existing record comes back untouched. A new version is a new row,
 * because a new version is a new agreement.
 *
 * Nothing here writes to the signature columns from a browser. The service
 * role does it, which is the only thing that can: migration 0038 pins those
 * columns against any browser session.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID, createHash } from 'node:crypto';
import { serviceClient } from '../_lib/supabase.js';
import { appOrigin } from '../_lib/env.js';
import { buildSignedPdf } from '../_lib/agreement-pdf.js';
import { AGREEMENTS, agreementPath, isAgreementDocType } from '../../shared/agreements.js';

const BUCKET = 'agreements';

/** A name, loosely. Long enough to be one, and containing a letter. */
const looksLikeAName = (value: string) => value.trim().length >= 2 && /\p{L}/u.test(value);

const firstAddress = (header: string | string[] | undefined): string | null => {
  const raw = Array.isArray(header) ? header[0] : header;
  const first = (raw ?? '').split(',')[0]?.trim();
  return first || null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
  const docType = body.docType;
  if (!isAgreementDocType(docType)) {
    return res.status(400).json({ error: 'Unknown document.' });
  }
  const doc = AGREEMENTS[docType];

  const signerName = typeof body.signerName === 'string' ? body.signerName.trim() : '';
  if (!looksLikeAName(signerName)) {
    return res.status(400).json({ error: 'Type your full legal name to sign.' });
  }

  const signerTitle = typeof body.signerTitle === 'string' ? body.signerTitle.trim() : '';
  const signerEmail = typeof body.signerEmail === 'string' ? body.signerEmail.trim() : '';
  const legalEntityName = typeof body.legalEntityName === 'string' ? body.legalEntityName.trim() : '';
  const brandId = typeof body.brandId === 'string' ? body.brandId : '';

  // Who is signing, from their own token. A name in a request body is a
  // claim; the token is the fact.
  const auth = req.headers.authorization ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return res.status(401).json({ error: 'Not signed in.' });

  const sb = serviceClient();
  const { data: userData, error: userError } = await sb.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (userError || !userId) return res.status(401).json({ error: 'Not signed in.' });

  /* The subject is the thing being bound: a brand, or a person. It decides
     the folder the document lands in, and therefore who can read it back. */
  let subjectId: string;
  let subjectLabel: string;

  if (doc.subject === 'brand') {
    if (!brandId) return res.status(400).json({ error: 'Missing brand.' });
    const { data: brand, error } = await sb
      .from('brands')
      .select('id, name, owner_user_id')
      .eq('id', brandId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Could not verify the brand.' });
    if (!brand || brand.owner_user_id !== userId) {
      return res.status(403).json({ error: 'That brand is not yours to sign for.' });
    }
    subjectId = brand.id as string;
    subjectLabel = (brand.name as string) ?? 'Brand';
  } else {
    const { data: creator, error } = await sb
      .from('creators')
      .select('id, handle')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'Could not read your creator profile.' });
    if (!creator) return res.status(403).json({ error: 'This account does not have a creator profile.' });
    subjectId = creator.id as string;
    subjectLabel = (creator.handle as string) ?? 'Creator';
  }

  // Already signed this exact version: hand back what exists rather than
  // minting a second document that says the same thing on a later date.
  const { data: existing } = await sb
    .from('agreements')
    .select('id, signed_at, document_path')
    .eq('doc_type', docType)
    .eq('version', doc.version)
    .eq(doc.subject === 'brand' ? 'brand_id' : 'user_id', doc.subject === 'brand' ? subjectId : userId)
    .maybeSingle();

  if (existing?.document_path) {
    return res.status(200).json({
      alreadySigned: true,
      signedAt: existing.signed_at,
      documentPath: existing.document_path,
    });
  }

  // The blank document, from the URL the signer's browser rendered.
  let template: Uint8Array;
  try {
    const url = `${appOrigin()}${agreementPath(doc)}`;
    const fetched = await fetch(url);
    if (!fetched.ok) throw new Error(`${url} returned ${fetched.status}`);
    template = new Uint8Array(await fetched.arrayBuffer());
  } catch (e) {
    console.error('[kyro] could not read the agreement template', e);
    return res.status(502).json({ error: 'Could not load the agreement right now. Try again shortly.' });
  }

  const templateSha256 = createHash('sha256').update(template).digest('hex');
  const recordId = randomUUID();
  const signedAt = new Date();

  const fields: Array<[string, string]> =
    doc.subject === 'brand'
      ? [
          ['Brand', subjectLabel],
          ['Brand legal name', legalEntityName || subjectLabel],
          ["Representative's full name", signerName],
          ["Representative's title", signerTitle],
          ['Business email', signerEmail || userData.user?.email || ''],
        ]
      : [
          ["Creator's full legal name", signerName],
          ["Creator's business name", legalEntityName],
          ["Creator's email address", signerEmail || userData.user?.email || ''],
        ];

  let pdf: Uint8Array;
  try {
    pdf = await buildSignedPdf(template, {
      recordId,
      documentTitle: doc.title,
      version: doc.version,
      fields,
      signature: signerName,
      signedAt,
      templateSha256,
      ip: firstAddress(req.headers['x-forwarded-for']),
      userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    });
  } catch (e) {
    console.error('[kyro] could not render the signed agreement', e);
    return res.status(500).json({ error: 'Could not produce your signed copy. Nothing was recorded.' });
  }

  const documentPath = `${subjectId}/${docType}-${doc.version}-${signedAt.getTime()}.pdf`;
  const { error: uploadError } = await sb.storage
    .from(BUCKET)
    .upload(documentPath, pdf, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    console.error('[kyro] could not store the signed agreement', uploadError);
    return res.status(500).json({ error: 'Could not save your signed copy. Nothing was recorded.' });
  }

  /* Recorded last and on purpose. A row that names a document is a promise
     that the document is there, and the order above is what keeps it true. */
  const { error: insertError } = await sb.from('agreements').insert({
    id: recordId,
    user_id: userId,
    brand_id: doc.subject === 'brand' ? subjectId : null,
    doc_type: docType,
    version: doc.version,
    signed_at: signedAt.toISOString(),
    signer_name: signerName,
    signer_title: signerTitle || null,
    signer_email: signerEmail || userData.user?.email || null,
    legal_entity_name: legalEntityName || null,
    template_sha256: templateSha256,
    document_path: documentPath,
    ip: firstAddress(req.headers['x-forwarded-for']),
    user_agent: (req.headers['user-agent'] as string | undefined) ?? null,
  });

  if (insertError) {
    // The PDF exists and nothing points at it. Say so rather than reporting
    // a signature that cannot be found again.
    console.error('[kyro] signed agreement stored but not recorded', documentPath, insertError);
    return res.status(500).json({ error: 'Your signature could not be recorded. Try again.' });
  }

  return res.status(200).json({
    alreadySigned: false,
    signedAt: signedAt.toISOString(),
    documentPath,
  });
}
