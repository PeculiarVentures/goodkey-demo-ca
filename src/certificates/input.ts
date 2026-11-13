import { CertificationRequest } from "@peculiar/asn1-csr";
import { AsnConvert } from "@peculiar/asn1-schema";
import { Extensions, GeneralNames } from "@peculiar/asn1-x509";
import * as x509 from "@peculiar/x509";
import { Convert } from "pvtsutils";
import {
  CertificateValidationError,
  KEY_USAGE_LABELS,
  type ExtendedKeyUsageConfiguration,
  type KeyUsage,
  type KeyUsageConfiguration,
  type SanConfiguration,
} from "./types";

const PARSE_OPTIONS = {
  berOptions: { maxDepth: 32, maxNodes: 10_000, maxContentLength: 1_048_576 },
};
const EXTENSION_REQUEST_OID = "1.2.840.113549.1.9.14";

export interface PublicKeyMetadata {
  algorithm: string;
  label: string;
  fingerprint: string;
  namedCurve?: string;
  modulusLength?: number;
}

export interface RequestedExtension {
  oid: string;
  critical: boolean;
  supported: boolean;
  name: string;
}

export interface CertificateRequestData {
  subject: string;
  san: SanConfiguration;
  keyUsage?: KeyUsageConfiguration;
  extendedKeyUsage?: ExtendedKeyUsageConfiguration;
  basicConstraints?: { ca: boolean; pathLength?: number; critical: boolean };
  extensions: RequestedExtension[];
  notices: string[];
}

export interface ParsedCertificateInput {
  raw: string | Uint8Array;
  format: "pem" | "der";
  type: "csr" | "spki" | "certificate";
  publicKey: x509.PublicKey;
  metadata: PublicKeyMetadata;
  csrSignatureVerified?: true;
  requested?: CertificateRequestData;
}

function inputError(code: string, message: string): CertificateValidationError {
  return new CertificateValidationError([{ field: "input", code, message }]);
}

function requestedData(csr: x509.Pkcs10CertificateRequest): CertificateRequestData {
  const request = AsnConvert.parse(csr.rawData, CertificationRequest, PARSE_OPTIONS);
  const result: CertificateRequestData = {
    subject: csr.subject,
    san: { entries: [], critical: false },
    extensions: [],
    notices: [],
  };
  const attributes = (request.certificationRequestInfo.attributes ?? []).filter(
    (attribute) => attribute.type === EXTENSION_REQUEST_OID,
  );
  if (attributes.length > 1 || attributes.some((attribute) => attribute.values.length !== 1))
    throw inputError(
      "duplicate-extension-request",
      "CSR must contain at most one extension request with a single value.",
    );
  const seen = new Set<string>();
  for (const attribute of attributes) {
    const extensions = AsnConvert.parse(attribute.values[0], Extensions, PARSE_OPTIONS);
    for (const extension of extensions) {
      if (seen.has(extension.extnID))
        throw inputError(
          "duplicate-extension",
          `CSR contains duplicate extension OID ${extension.extnID}.`,
        );
      seen.add(extension.extnID);
      const raw = AsnConvert.serialize(extension);
      const metadata: RequestedExtension = {
        oid: extension.extnID,
        critical: extension.critical,
        supported: true,
        name: extension.extnID,
      };
      switch (extension.extnID) {
        case "2.5.29.17": {
          metadata.name = "Subject alternative name";
          result.san.critical = extension.critical;
          for (const name of AsnConvert.parse(extension.extnValue, GeneralNames, PARSE_OPTIONS)) {
            if (name.dNSName !== undefined)
              result.san.entries.push({ type: "dns", value: name.dNSName });
            else if (name.rfc822Name !== undefined)
              result.san.entries.push({ type: "email", value: name.rfc822Name });
            else if (name.iPAddress !== undefined)
              result.san.entries.push({ type: "ip", value: name.iPAddress });
            else if (name.uniformResourceIdentifier !== undefined)
              result.san.entries.push({ type: "url", value: name.uniformResourceIdentifier });
            else {
              metadata.supported = false;
              result.notices.push(
                "CSR SAN contains an unsupported name type; only DNS, IP, email, and URI names can be copied into the configuration.",
              );
            }
          }
          break;
        }
        case "2.5.29.15": {
          metadata.name = "Key usage";
          const usage = new x509.KeyUsagesExtension(raw, PARSE_OPTIONS);
          const usages = (Object.keys(KEY_USAGE_LABELS) as KeyUsage[]).filter(
            (name) => (usage.usages & x509.KeyUsageFlags[name]) !== 0,
          );
          result.keyUsage = { usages, critical: usage.critical };
          if (usage.usages & (x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign))
            result.notices.push(
              "CSR requests CA or CRL signing key usages, which cannot be issued by this end-entity certificate workflow.",
            );
          break;
        }
        case "2.5.29.37": {
          metadata.name = "Extended key usage";
          const usage = new x509.ExtendedKeyUsageExtension(raw, PARSE_OPTIONS);
          result.extendedKeyUsage = { oids: usage.usages.map(String), critical: usage.critical };
          break;
        }
        case "2.5.29.19": {
          metadata.name = "Basic constraints";
          const constraints = new x509.BasicConstraintsExtension(raw, PARSE_OPTIONS);
          result.basicConstraints = {
            ca: constraints.ca,
            pathLength: constraints.pathLength,
            critical: constraints.critical,
          };
          if (constraints.ca)
            result.notices.push(
              "CSR requests a CA certificate; issuance is restricted to end-entity certificates (cA=false).",
            );
          break;
        }
        default:
          metadata.supported = false;
          result.notices.push(
            `Requested extension ${extension.extnID}${extension.critical ? " (critical)" : ""} is not supported and will not be applied.`,
          );
      }
      result.extensions.push(metadata);
    }
  }
  return result;
}

async function keyMetadata(publicKey: x509.PublicKey): Promise<PublicKeyMetadata> {
  const algorithm = publicKey.algorithm;
  if (
    !["RSASSA-PKCS1-v1_5", "RSA-PSS", "RSA-OAEP", "ECDSA", "ECDH", "Ed25519"].includes(
      algorithm.name,
    )
  )
    throw inputError("unsupported-key", `Unsupported public key algorithm: ${algorithm.name}.`);
  await publicKey.export();
  const metadata: PublicKeyMetadata = {
    algorithm: algorithm.name,
    label: algorithm.name,
    fingerprint: Convert.ToHex(await publicKey.getThumbprint("SHA-256")),
  };
  if ("namedCurve" in algorithm && typeof algorithm.namedCurve === "string") {
    metadata.namedCurve = algorithm.namedCurve;
    metadata.label = `${algorithm.name} ${algorithm.namedCurve}`;
  }
  if ("modulusLength" in algorithm && typeof algorithm.modulusLength === "number") {
    metadata.modulusLength = algorithm.modulusLength;
    metadata.label = `RSA ${algorithm.modulusLength}`;
  }
  return metadata;
}

export async function parseCertificateInput(
  input: string | ArrayBuffer | Uint8Array,
): Promise<ParsedCertificateInput> {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof Uint8Array
        ? input.slice()
        : new Uint8Array(input.slice(0));
  if ((typeof raw === "string" ? raw.length : raw.byteLength) > 1_048_576)
    throw inputError("too-large", "Certificate input must not exceed 1 MiB.");
  const text = typeof raw === "string" ? raw.trim() : new TextDecoder().decode(raw).trim();
  let data: Uint8Array<ArrayBuffer>;
  let tag: string | undefined;
  let format: "pem" | "der";
  if (typeof raw === "string" || text.startsWith("-----BEGIN")) {
    const match =
      /^-----BEGIN (CERTIFICATE REQUEST|NEW CERTIFICATE REQUEST|PUBLIC KEY|CERTIFICATE)-----\s+([a-z\d+/=\s]+)\s+-----END \1-----$/i.exec(
        text,
      );
    if (
      !match ||
      !/^(?:[a-z\d+/]{4})*(?:[a-z\d+/]{2}==|[a-z\d+/]{3}=)?$/i.test(match[2].replace(/\s/g, ""))
    )
      throw inputError(
        "invalid-pem",
        "Paste one complete PEM CSR, SPKI public key, or X.509 certificate.",
      );
    tag = match[1].toUpperCase();
    data = new Uint8Array(Convert.FromBase64(match[2].replace(/\s/g, "")));
    format = "pem";
  } else {
    data = new Uint8Array(raw);
    format = "der";
  }
  if (!data.length || data[0] !== 0x30)
    throw inputError(
      "invalid-der",
      "Input is not a DER CSR, SPKI public key, or X.509 certificate.",
    );
  let parsed: x509.Pkcs10CertificateRequest | x509.PublicKey | x509.X509Certificate | undefined;
  let type: ParsedCertificateInput["type"] = "spki";
  const candidates: ParsedCertificateInput["type"][] = tag
    ? [tag === "PUBLIC KEY" ? "spki" : tag === "CERTIFICATE" ? "certificate" : "csr"]
    : ["csr", "certificate", "spki"];
  for (const candidate of candidates) {
    try {
      parsed =
        candidate === "csr"
          ? new x509.Pkcs10CertificateRequest(data, PARSE_OPTIONS)
          : candidate === "certificate"
            ? new x509.X509Certificate(data, PARSE_OPTIONS)
            : new x509.PublicKey(data, PARSE_OPTIONS);
      type = candidate;
      break;
    } catch {
      /* Try another ASN.1 structure only when structural parsing fails. */
    }
  }
  if (!parsed)
    throw inputError(
      "invalid-input",
      "Cannot parse this CSR, SPKI public key, or X.509 certificate.",
    );
  try {
    const publicKey = parsed instanceof x509.PublicKey ? parsed : parsed.publicKey;
    const result: ParsedCertificateInput = {
      raw,
      format,
      type,
      publicKey,
      metadata: await keyMetadata(publicKey),
    };
    if (parsed instanceof x509.Pkcs10CertificateRequest) {
      if (!(await parsed.verify()))
        throw inputError(
          "invalid-signature",
          "CSR signature verification failed; the request may have been modified.",
        );
      result.csrSignatureVerified = true;
      result.requested = requestedData(parsed);
    }
    return result;
  } catch (error) {
    if (error instanceof CertificateValidationError) throw error;
    throw inputError(
      "invalid-input",
      "The public key, CSR signature, or requested extensions are invalid or unsupported.",
    );
  }
}
