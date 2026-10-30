/**
 * KYRO: the documents people sign
 *
 * One registry, read by the signing screen and by the server that renders the
 * signed copy. If these two ever disagreed about which version is current,
 * the version recorded in the database would stop describing the document the
 * person actually read, which is the only thing the record is for.
 *
 * Adding a version means adding a file under public/agreements/ and changing
 * `version` and `file` here together. Existing signatures keep pointing at the
 * version they accepted, and everyone is asked again, which is the intended
 * behaviour rather than an inconvenience: a new version is a new agreement.
 */

export type AgreementDocType = 'content_usage_rights' | 'creator_agreement';

export interface AgreementDoc {
  docType: AgreementDocType;
  /** As it appears on the document itself. */
  title: string;
  version: string;
  /** Filename under public/agreements/. */
  file: string;
  /** Who signs it. Decides which identity the server checks. */
  subject: 'brand' | 'creator';
  /** One line, for the screen that asks someone to sign. */
  blurb: string;
}

export const AGREEMENTS: Record<AgreementDocType, AgreementDoc> = {
  content_usage_rights: {
    docType: 'content_usage_rights',
    title: 'KYRO Content Usage Rights',
    version: '1.0',
    file: 'content-usage-rights-v1.0.pdf',
    subject: 'brand',
    blurb: 'What your brand may and may not do with a creator video it approves.',
  },
  creator_agreement: {
    docType: 'creator_agreement',
    title: 'KYRO Creator Operations and Commission Agreement',
    version: '1.1',
    file: 'creator-agreement-v1.1.pdf',
    subject: 'creator',
    blurb: 'How you are paid, what you keep, and what KYRO does and does not do.',
  },
};

export const isAgreementDocType = (value: unknown): value is AgreementDocType =>
  typeof value === 'string' && value in AGREEMENTS;

/** Where the blank document is served. Public: it is the same for everyone. */
export const agreementPath = (doc: AgreementDoc): string => `/agreements/${doc.file}`;
