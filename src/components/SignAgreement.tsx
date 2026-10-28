/**
 * Signing a KYRO agreement.
 *
 * The document is shown, not summarised. A page that says "I agree to the
 * terms" with a link somewhere else is a page designed to be clicked through,
 * and the whole value of this record is that the person read the thing they
 * put their name to.
 *
 * The typed name is the signature. There is no separate "I agree" checkbox,
 * because a name typed under a sentence that says what typing it means is
 * both clearer and better evidence than a box that could have been ticked by
 * a tab key.
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
  docType, brandId, userId, subjectName, defaultEmail, defaultName, onSigned,
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
    const found = await hasSigned(docType, { brandId, userId });
    setSignedAt(found.signedAt);
    setDocumentPath(found.documentPath);
    setChecking(false);
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

  return (
    <div className="bg-surface border border-line rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-line flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-heading flex items-center gap-2">
            <FileText size={18} className="text-body flex-shrink-0" />
            {doc.title}
          </h2>
          <p className="text-sm text-muted mt-0.5">{doc.blurb}</p>
          <p className="text-xs text-faint mt-1">Version {doc.version}</p>
        </div>
        <a
          href={agreementPath(doc)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading"
        >
          <ExternalLink size={13} /> Open in a new tab
        </a>
      </div>

      {/* The document itself. A summary would be easier to read and would
          defeat the point of the record. */}
      <object
        data={agreementPath(doc)}
        type="application/pdf"
        className="w-full h-[460px] bg-surface-2 border-b border-line"
        aria-label={doc.title}
      >
        <p className="p-6 text-sm text-muted">
          Your browser will not display the document here.{' '}
          <a href={agreementPath(doc)} target="_blank" rel="noreferrer" className="text-kyro-500 hover:underline">
            Open it in a new tab
          </a>{' '}
          before signing.
        </p>
      </object>

      {checking ? (
        <p className="p-6 text-sm text-muted">Checking…</p>
      ) : signedAt ? (
        <div className="p-5 flex flex-wrap items-center gap-3">
          <CheckCircle2 size={18} className="text-good flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-heading">
              Signed {new Date(signedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="text-xs text-muted">
              Your signed copy is kept on file{subjectName ? ` for ${subjectName}` : ''}.
            </p>
          </div>
          {documentPath && (
            <button
              type="button"
              onClick={() => void open()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-2 border border-line text-xs font-semibold text-body hover:text-heading"
            >
              <Download size={13} /> Signed copy
            </button>
          )}
        </div>
      ) : (
        <div className="p-5 space-y-4">
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-kyro text-white text-sm font-semibold disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            {busy ? 'Signing…' : 'Sign and keep a copy'}
          </button>
        </div>
      )}
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
    <label className="block">
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
