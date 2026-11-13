import { Name } from "@peculiar/x509";
import type { X509Configuration } from "./types";

export const BUILT_IN_PRESETS = [
  {
    id: "none",
    name: "Custom",
    description: "Digital signature with editable certificate settings.",
  },
  { id: "code_signing", name: "Code signing", description: "Sign software and executable code." },
  { id: "smime", name: "S/MIME", description: "Email signing and, where supported, encryption." },
  { id: "pdf_signing", name: "PDF signing", description: "Sign Adobe PDF documents." },
  {
    id: "cms_encryption",
    name: "CMS encryption",
    description: "Encrypt documents using RSA or EC keys.",
  },
] as const;

export type CertificatePresetId = (typeof BUILT_IN_PRESETS)[number]["id"];

export interface PresetOptions {
  subject?: string;
  validityDays?: number;
  keyAlgorithm?: string;
  email?: string;
}

export function createPresetConfiguration(
  id: CertificatePresetId = "none",
  options: PresetOptions = {},
): X509Configuration {
  const configuration: X509Configuration = {
    subject: options.subject ?? "CN=Test certificate, O=GoodKey, C=US, E=your@email.com",
    validity: { mode: "relative", days: options.validityDays ?? 365 },
    san: { entries: [], critical: false },
    keyUsage: { usages: ["digitalSignature"], critical: true },
    extendedKeyUsage: { oids: [], critical: false },
  };
  const rsa = !options.keyAlgorithm || options.keyAlgorithm.startsWith("RSA");
  const ec = options.keyAlgorithm === "ECDSA" || options.keyAlgorithm === "ECDH";
  switch (id) {
    case "code_signing":
      configuration.extendedKeyUsage.oids = ["1.3.6.1.5.5.7.3.3"];
      break;
    case "smime": {
      configuration.keyUsage.usages = ["digitalSignature", "nonRepudiation"];
      if (rsa) configuration.keyUsage.usages.push("keyEncipherment");
      if (ec) configuration.keyUsage.usages.push("keyAgreement");
      configuration.extendedKeyUsage.oids = ["1.3.6.1.5.5.7.3.4"];
      let email = options.email;
      if (!email) {
        try {
          email = new Name(configuration.subject).getField("E")[0];
        } catch {
          // The configuration validator reports malformed subject names.
        }
      }
      if (email) configuration.san.entries = [{ type: "email", value: email }];
      break;
    }
    case "pdf_signing":
      configuration.extendedKeyUsage.oids = ["1.2.840.113583.1.1.10"];
      break;
    case "cms_encryption":
      configuration.keyUsage.usages = ec
        ? ["keyAgreement"]
        : ["keyEncipherment", "dataEncipherment"];
      configuration.extendedKeyUsage.oids = ["1.3.6.1.4.1.311.80.1"];
      break;
  }
  return configuration;
}
