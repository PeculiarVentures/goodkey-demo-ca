import type { PublicKey, X509Certificate } from "@peculiar/x509";

export const KEY_USAGE_LABELS = {
  digitalSignature: "Digital signature",
  nonRepudiation: "Content commitment (non-repudiation)",
  keyEncipherment: "Key encipherment (RSA)",
  dataEncipherment: "Data encipherment (RSA)",
  keyAgreement: "Key agreement (EC)",
  encipherOnly: "Encipher only (with key agreement)",
  decipherOnly: "Decipher only (with key agreement)",
} as const;

export type KeyUsage = keyof typeof KEY_USAGE_LABELS;

export const EXTENDED_KEY_USAGE_LABELS: Readonly<Record<string, string>> = {
  "1.3.6.1.5.5.7.3.1": "TLS server authentication",
  "1.3.6.1.5.5.7.3.2": "TLS client authentication",
  "1.3.6.1.5.5.7.3.3": "Code signing",
  "1.3.6.1.5.5.7.3.4": "Email protection (S/MIME)",
  "1.3.6.1.5.5.7.3.8": "Time stamping",
  "1.3.6.1.5.5.7.3.9": "OCSP signing",
  "1.2.840.113583.1.1.10": "Adobe PDF signing",
  "1.3.6.1.4.1.311.80.1": "Document encryption",
  "2.5.29.37.0": "Any extended key usage",
};

export type SubjectAlternativeName =
  | { type: "dns"; value: string }
  | { type: "ip"; value: string }
  | { type: "email"; value: string }
  | { type: "url"; value: string };

export interface SanConfiguration {
  entries: SubjectAlternativeName[];
  critical: boolean;
}

export interface KeyUsageConfiguration {
  usages: KeyUsage[];
  critical: boolean;
}

export interface ExtendedKeyUsageConfiguration {
  oids: string[];
  critical: boolean;
}

export type RelativeValidity = { mode: "relative"; days: number };
export type ExactValidity = { mode: "exact"; notBefore: string; notAfter: string };

export interface X509Configuration {
  subject: string;
  validity: RelativeValidity | ExactValidity;
  san: SanConfiguration;
  keyUsage: KeyUsageConfiguration;
  extendedKeyUsage: ExtendedKeyUsageConfiguration;
}

export interface ResolvedX509Configuration extends Omit<X509Configuration, "validity"> {
  notBefore: string;
  notAfter: string;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export class CertificateValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "CertificateValidationError";
  }
}

export interface CertificateValidationContext {
  caCertificate: X509Certificate;
  publicKey: PublicKey;
  now?: Date;
}

export function cloneConfiguration(configuration: X509Configuration): X509Configuration {
  return {
    subject: configuration.subject,
    validity: { ...configuration.validity },
    san: {
      entries: configuration.san.entries.map((entry) => ({ ...entry })),
      critical: configuration.san.critical,
    },
    keyUsage: {
      usages: [...configuration.keyUsage.usages],
      critical: configuration.keyUsage.critical,
    },
    extendedKeyUsage: {
      oids: [...configuration.extendedKeyUsage.oids],
      critical: configuration.extendedKeyUsage.critical,
    },
  };
}
