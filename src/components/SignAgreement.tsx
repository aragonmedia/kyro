/**
 * Signing a KYRO agreement.
 *
 * The document opens in its own tab rather than embedding in the page. An
 * embedded PDF brings a browser's own viewer with it, complete with a
 * toolbar, a thumbnail rail and a zoom control, none of which belong inside
 * a portal: it reads as a foreign object dropped into the panel, it is
 * unusable on a phone, and the actual job here, three fields and a name, ends
 * up below the fold of someone else's UI. A button that says what it opens
 * is both calmer and easier to read the document in.
 *
 * The typed name is the signature. There is no separate "I agree" checkbox,
 * because a name typed under a sentence that says what typing it means is
 * both clearer and better evidence than a box a tab key could have ticked.
 *
 * Nothing here produces the signed PDF. The browser sends what was typed and
 * the server renders, hashes and stores it; a document the browser made would
 * be a document the browser could have written anything into.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import {
  AGREEMENTS, agreementPath, hasSigned, openSignedCopy, signAgreement,
  type AgreementDocType,
} from '../lib/agreements';

export function SignAgreement({
  docType, brandId, userId, subjectName, defaultEmail, defaultName, onSigned, bare = false,
}: {
  docType: AgreementDocType;
  /** Required for a brand document. */
  brandId?: string;
  /** Required to show an existing creator signature. */
  userId?: string;
  /** The brand or creator this is being signed for, shown for confirmation. */
  subjectName?: string;
  defaultEmail?: string | null;
  defaultName?: string | null;
  onSigned?: (documentPath: string) => void;
  /** Drops the panel chrome, for use inside a card that has its own heading. */
  bare?: boolean;
}) {
  const doc = AGREEMENTS[docType];
  const isBrand = doc.subject === 'brand';

  const [legalEntityName, setLegalEntityName] = useState(isBrand ? subjectName ?? '' : '');
  const [signerName, setSignerName] = useState(defaultName ?? '');
  const [signerTitle, setSignerTitle] = useState('');
  const [signerEmail, setSignerEmail] = useState(defaultEmail ?? '');

  const [signedAt, setSignedAt] = useState<string | null>(null);
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const look = useCallback(async () => {
    setChecking(true);
    try {
      const found = await hasSigned(docType, { brandId, userId });
      setSignedAt(found.signedAt);
      setDocumentPath(found.documentPath);
    } finally {
      // Always. A panel stuck on "Checking…" is worse than one that offers
      // the form and fails honestly when it is submitted.
      setChecking(false);
    }
  }, [docType, brandId, userId]);

  useEffect(() => { void look(); }, [look]);

  const sign = async () => {
    setBusy(true);
    setError(null);
    const res = await signAgreement({
      docType,
      brandId,
      signerName,
      signerTitle: signerTitle || undefined,
      signerEmail: signerEmail || undefined,
      legalEntityName: legalEntityName || undefined,
    });
    setBusy(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    setSignedAt(res.signedAt);
    setDocumentPath(res.documentPath);
    if (res.documentPath) onSigned?.(res.documentPath);
  };

  const open = async () => {
    if (!documentPath) return;
    const problem = await openSignedCopy(documentPath);
    if (problem) setError(problem);
  };

  const ready = signerName.trim().length >= 2;

  /* The document itself, always one click away and never in the way. */
  const readButton = (
    <a
      href={agreementPath(doc)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-2 border border-line text-sm font-semibold text-heading hover:border-kyro-600 transition"
    >
      <ExternalLink size={15} /> Read the document
    </a>
  );

  const inner = checking ? (
    <p className="text-sm text-muted">Checking…</p>
  ) : signedAt ? (
    <div className="flex flex-wrap items-center gap-3">
      <CheckCircle2 size={18} className="text-good flex-shrink-0" />
      <div className="flex-1 min-w-[12rem]">
        <p className="text-sm font-semibold text-heading">
          Signed {new Date(signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <p className="text-xs text-muted">
          Your signed copy is kept on file{subjectName ? ` for ${subjectName}` : ''}.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {readButton}
        {documentPath && (
          <button
            type="button"
            onClick={() => void open()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-2 border border-line text-sm font-semibold text-heading hover:border-kyro-600 transition"
          >
            <Download size={15} /> Signed copy
          </button>
        )}
      </div>
    </div>
  ) : (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {readButton}
        <p className="text-xs text-faint">
          Opens in a new tab. Version {doc.version}.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {isBrand ? (
          <>
            <Field
              label="Brand's full legal name"
              hint="The entity being bound, if it differs from your brand name."
              value={legalEntityName}
              onChange={setLegalEntityName}
            />
            <Field label="Your full name" value={signerName} onChange={setSignerName} />
            <Field label="Your title" value={signerTitle} onChange={setSignerTitle} />
            <Field label="Business email" value={signerEmail} onChange={setSignerEmail} type="email" />
          </>
        ) : (
          <>
            <Field label="Your full legal name" value={signerName} onChange={setSignerName} />
            <Field
              label="Business name, if any"
              hint="Leave blank if you are paid as an individual."
              value={legalEntityName}
              onChange={setLegalEntityName}
            />
            <Field label="Your email address" value={signerEmail} onChange={setSignerEmail} type="email" />
          </>
        )}
      </div>

      <div className="p-4 rounded-xl bg-surface-2 border border-line">
        <p className="text-xs text-muted">
          {isBrand
            ? 'By typing your name you confirm you are authorized to accept this on behalf of the brand, and that you have read and understood this document and the KYRO Terms of Service.'
            : 'By typing your name you confirm that you have read and understood this agreement and the KYRO Terms of Service.'}
        </p>
        <input
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Type your full legal name"
          className="w-full mt-3 px-3 py-2.5 bg-surface border border-line rounded-lg text-lg italic text-heading placeholder-faint placeholder:not-italic focus:outline-none focus:border-kyro-600"
        />
        <p className="text-[11px] text-faint mt-2">
          This typed name is your signature. KYRO records the date, this document's version and a
          fingerprint of the exact text you accepted, and keeps a signed copy you can download.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-bad/30 bg-bad-soft">
          <p className="text-xs text-bad">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void sign()}
        disabled={!ready || busy}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-40"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
        {busy ? 'Signing…' : 'Sign and keep a copy'}
      </button>
    </div>
  );

  if (bare) return inner;

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 md:p-6 space-y-4">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-heading flex items-center gap-2">
          <FileText size={18} className="text-body flex-shrink-0" />
          <span className="min-w-0">{doc.title}</span>
        </h2>
        <p className="text-sm text-muted mt-0.5">{doc.blurb}</p>
      </div>
      {inner}
    </div>
  );
}

function Field({
  label, hint, value, onChange, type = 'text',
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] uppercase tracking-wider text-faint">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2 bg-surface-2 border border-line rounded-lg text-sm text-heading placeholder-faint focus:outline-none focus:border-kyro-600"
      />
      {hint && <span className="block text-[11px] text-faint mt-1">{hint}</span>}
    </label>
  );
}
