import {
  BasicConstraintsExtension,
  GeneralName,
  KeyUsageFlags,
  KeyUsagesExtension,
  Name,
} from "@peculiar/x509";
import {
  CertificateValidationError,
  KEY_USAGE_LABELS,
  cloneConfiguration,
  type CertificateValidationContext,
  type KeyUsage,
  type ResolvedX509Configuration,
  type SubjectAlternativeName,
  type ValidationIssue,
  type X509Configuration,
} from "./types";

export const MILLISECONDS_PER_DAY = 86_400_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

export function isOid(value: string): boolean {
  if (!/^[0-2](?:\.(?:0|[1-9]\d*)){1,}$/.test(value)) return false;
  const [first, second] = value.split(".");
  return first === "2" || BigInt(second) <= 39n;
}

function object(
  value: unknown,
  fields: string[],
  field: string,
  issues: ValidationIssue[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push({ field, code: "type", message: `${field || "Configuration"} must be an object.` });
    return {};
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) {
      issues.push({
        field: field ? `${field}.${key}` : key,
        code: "unsupported",
        message: `Unsupported setting: ${field ? `${field}.` : ""}${key}.`,
      });
    }
  }
  return value;
}

function string(value: unknown, field: string, issues: ValidationIssue[]): string {
  if (typeof value === "string") return value;
  issues.push({ field, code: "type", message: `${field} must be text.` });
  return "";
}

function boolean(value: unknown, field: string, issues: ValidationIssue[]): boolean {
  if (typeof value === "boolean") return value;
  issues.push({ field, code: "type", message: `${field} must be true or false.` });
  return false;
}

function array(value: unknown, field: string, issues: ValidationIssue[]): unknown[] {
  if (Array.isArray(value)) return value;
  issues.push({ field, code: "type", message: `${field} must be an array.` });
  return [];
}

function readShape(value: unknown): {
  configuration: X509Configuration;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  const root = object(
    value,
    ["subject", "validity", "san", "keyUsage", "extendedKeyUsage"],
    "",
    issues,
  );
  const validity = object(
    root.validity,
    ["mode", "days", "notBefore", "notAfter"],
    "validity",
    issues,
  );
  if (validity.mode !== "relative" && validity.mode !== "exact") {
    issues.push({
      field: "validity.mode",
      code: "type",
      message: "Select relative or exact validity.",
    });
  }
  const mode = validity.mode === "exact" ? "exact" : "relative";
  for (const key of Object.keys(validity)) {
    if (
      (mode === "relative" && ["notBefore", "notAfter"].includes(key)) ||
      (mode === "exact" && key === "days")
    ) {
      issues.push({
        field: `validity.${key}`,
        code: "unsupported",
        message: "Validity cannot combine relative days and exact dates.",
      });
    }
  }
  const san = object(root.san, ["entries", "critical"], "san", issues);
  const keyUsage = object(root.keyUsage, ["usages", "critical"], "keyUsage", issues);
  const extendedKeyUsage = object(
    root.extendedKeyUsage,
    ["oids", "critical"],
    "extendedKeyUsage",
    issues,
  );
  const entries: SubjectAlternativeName[] = [];
  for (const [index, item] of array(san.entries, "san.entries", issues).entries()) {
    const field = `san.entries.${index}`;
    const entry = object(item, ["type", "value"], field, issues);
    const entryValue = string(entry.value, `${field}.value`, issues);
    switch (entry.type) {
      case "dns":
      case "email":
      case "ip":
      case "url":
        entries.push({ type: entry.type, value: entryValue });
        break;
      default:
        issues.push({
          field: `${field}.type`,
          code: "unsupported",
          message: "Select DNS, IP, email, or URI for the alternative name.",
        });
    }
  }
  const usages: KeyUsage[] = [];
  for (const usage of array(keyUsage.usages, "keyUsage.usages", issues)) {
    if (typeof usage === "string" && Object.hasOwn(KEY_USAGE_LABELS, usage))
      usages.push(usage as KeyUsage);
    else
      issues.push({
        field: "keyUsage.usages",
        code: "unsupported",
        message: "Only end-entity key usages are supported; CA and CRL signing are unavailable.",
      });
  }
  if (mode === "relative" && typeof validity.days !== "number") {
    issues.push({
      field: "validity.days",
      code: "type",
      message: "Validity days must be a number.",
    });
  }
  return {
    configuration: {
      subject: string(root.subject, "subject", issues),
      validity:
        mode === "relative"
          ? { mode, days: typeof validity.days === "number" ? validity.days : NaN }
          : {
              mode,
              notBefore: string(validity.notBefore, "validity.notBefore", issues),
              notAfter: string(validity.notAfter, "validity.notAfter", issues),
            },
      san: { entries, critical: boolean(san.critical, "san.critical", issues) },
      keyUsage: { usages, critical: boolean(keyUsage.critical, "keyUsage.critical", issues) },
      extendedKeyUsage: {
        oids: array(extendedKeyUsage.oids, "extendedKeyUsage.oids", issues).map((oid) =>
          string(oid, "extendedKeyUsage.oids", issues),
        ),
        critical: boolean(extendedKeyUsage.critical, "extendedKeyUsage.critical", issues),
      },
    },
    issues,
  };
}

export function isDnsName(value: string, allowWildcard = true): boolean {
  const name = allowWildcard && value.startsWith("*.") ? value.slice(2) : value;
  return (
    name.length > 0 &&
    name.length <= 253 &&
    name
      .split(".")
      .every((label) => label.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label))
  );
}

export function isEmail(value: string): boolean {
  if (value.length > 254) return false;
  const pieces = value.split("@");
  if (pieces.length !== 2 || pieces[0].length > 64 || !isDnsName(pieces[1], false)) return false;
  return /^[a-z\d!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z\d!#$%&'*+\-/=?^_`{|}~]+)*$/i.test(pieces[0]);
}

function validIp(value: string): boolean {
  if (value.includes(":")) {
    if (!/^[a-f\d:.]+$/i.test(value)) return false;
    try {
      return new URL(`http://[${value}]/`).hostname.startsWith("[");
    } catch {
      return false;
    }
  }
  return (
    /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value) &&
    value.split(".").every((part) => Number(part) <= 255)
  );
}

export function validateSubject(
  subject: string,
  options: { syntaxOnly?: boolean } = {},
): string | undefined {
  if (!subject.trim())
    return "Enter a subject DN, or use a non-empty critical SAN for a certificate without a subject.";
  if (hasControlCharacters(subject)) return "Subject must not contain control characters.";
  let quoted = false;
  let start = 0;
  const parts: string[] = [];
  for (let index = 0; index < subject.length; index++) {
    const char = subject[index];
    if (char === "\\") {
      const rest = subject.slice(index + 1);
      if (/^[a-f\d]{2}/i.test(rest))
        return "Hex-escaped DN values are unsupported; enter Unicode text or escape punctuation directly (for example \\,).";
      else if (/^[,=+<>#;"\\ ]/.test(rest)) index++;
      else return "Subject contains an invalid escape sequence.";
    } else if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "," || char === "+")) {
      parts.push(subject.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted) return "Subject contains an unterminated quoted value.";
  parts.push(subject.slice(start).trim());
  if (parts.some((part) => !/^(?:[a-z][a-z\d]*|\d+(?:\.\d+)+)\s*=\s*.+$/i.test(part))) {
    return "Use a complete distinguished name, for example CN=Example, O=GoodKey, C=US.";
  }
  if (
    parts.some((part) => {
      const type = part.slice(0, part.indexOf("=")).trim();
      return /^\d/.test(type) && !isOid(type);
    })
  )
    return "Subject numeric attribute types must be valid OIDs.";
  try {
    const name = new Name(new Name(subject).toArrayBuffer());
    const attributes = name.toJSON().flatMap((rdn) => Object.entries(rdn));
    // Name's permissive text parser can otherwise accept only a fragment of the input.
    if (attributes.reduce((total, [, values]) => total + values.length, 0) !== parts.length)
      return "Subject contains an invalid or unsupported attribute.";
    for (const [oid, values] of attributes) {
      if (values.some((value) => !value.trim() || hasControlCharacters(value)))
        return "Subject attributes must have non-empty values without control characters.";
      if (!options.syntaxOnly && (oid === "C" || oid === "2.5.4.6")) {
        if (values.some((value) => !/^[a-z]{2}$/i.test(value)))
          return "Country (C) must be a two-letter country code.";
      }
      if (
        !options.syntaxOnly &&
        ["E", "1.2.840.113549.1.9.1"].includes(oid) &&
        values.some((value) => !isEmail(value))
      )
        return "Subject email (E) must be a valid email address.";
    }
  } catch {
    return "Subject contains an invalid or unknown attribute; use a standard name or numeric OID.";
  }
  return undefined;
}

function parseDate(value: string): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return new Date(NaN);
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return new Date(NaN);
  return new Date(value);
}

function validityDates(configuration: X509Configuration, now: Date): [Date, Date] {
  if (configuration.validity.mode === "exact") {
    return [
      parseDate(configuration.validity.notBefore),
      parseDate(configuration.validity.notAfter),
    ];
  }
  const start = Math.floor(now.getTime() / 1000) * 1000;
  return [new Date(start), new Date(start + configuration.validity.days * MILLISECONDS_PER_DAY)];
}

function semanticIssues(
  configuration: X509Configuration,
  context?: CertificateValidationContext,
  allowMissingIdentity = false,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (field: string, code: string, message: string) =>
    issues.push({ field, code, message });
  const { subject, san, keyUsage, extendedKeyUsage, validity } = configuration;
  const subjectError = validateSubject(subject);
  if (
    subjectError &&
    !(subject.trim() === "" && ((san.entries.length > 0 && san.critical) || allowMissingIdentity))
  )
    add("subject", "invalid", subjectError);
  if (!san.entries.length && san.critical)
    add("san.entries", "empty", "A critical SAN must contain at least one alternative name.");
  const seenNames = new Set<string>();
  for (const [index, entry] of san.entries.entries()) {
    let valid =
      entry.value.trim() === entry.value &&
      entry.value.length > 0 &&
      /^[\x21-\x7e]+$/.test(entry.value);
    if (entry.type === "dns") valid &&= isDnsName(entry.value);
    if (entry.type === "email") valid &&= isEmail(entry.value);
    if (entry.type === "ip") valid &&= validIp(entry.value);
    if (entry.type === "url") {
      try {
        valid &&= Boolean(new URL(entry.value).protocol);
      } catch {
        valid = false;
      }
    }
    if (valid) {
      try {
        new GeneralName(entry.type, entry.value);
      } catch {
        valid = false;
      }
    }
    if (!valid)
      add(
        `san.entries.${index}.value`,
        "invalid",
        `Enter a valid ASCII ${entry.type === "url" ? "absolute URI" : entry.type} alternative name.`,
      );
    let normalized = entry.value;
    if (entry.type === "dns") normalized = normalized.toLowerCase();
    if (entry.type === "ip" && valid)
      normalized = new GeneralName("ip", entry.value).toString("hex");
    const unique = `${entry.type}:${normalized}`;
    if (seenNames.has(unique))
      add(
        `san.entries.${index}.value`,
        "duplicate",
        "Alternative names must not contain duplicates.",
      );
    seenNames.add(unique);
  }
  if (!keyUsage.usages.length && keyUsage.critical)
    add(
      "keyUsage.usages",
      "empty",
      "Select a key usage, or turn off criticality to omit the KU extension.",
    );
  if (new Set(keyUsage.usages).size !== keyUsage.usages.length)
    add("keyUsage.usages", "duplicate", "Key usages must not contain duplicates.");
  const has = (usage: KeyUsage) => keyUsage.usages.includes(usage);
  if ((has("encipherOnly") || has("decipherOnly")) && !has("keyAgreement"))
    add(
      "keyUsage.usages",
      "incompatible",
      "Encipher only and decipher only require key agreement.",
    );
  if (has("encipherOnly") && has("decipherOnly"))
    add(
      "keyUsage.usages",
      "incompatible",
      "Encipher only and decipher only cannot both be selected.",
    );
  if (new Set(extendedKeyUsage.oids).size !== extendedKeyUsage.oids.length)
    add(
      "extendedKeyUsage.oids",
      "duplicate",
      "Extended key usage OIDs must not contain duplicates.",
    );
  for (const oid of extendedKeyUsage.oids) {
    if (!isOid(oid))
      add("extendedKeyUsage.oids", "invalid", `Invalid extended key usage OID: ${oid}.`);
  }
  if (!extendedKeyUsage.oids.length && extendedKeyUsage.critical)
    add("extendedKeyUsage.oids", "empty", "A critical EKU must contain at least one purpose.");
  const consistent: Readonly<Record<string, KeyUsage[]>> = {
    "1.3.6.1.5.5.7.3.1": ["digitalSignature", "keyEncipherment", "keyAgreement"],
    "1.3.6.1.5.5.7.3.2": ["digitalSignature", "keyAgreement"],
    "1.3.6.1.5.5.7.3.3": ["digitalSignature"],
    "1.3.6.1.5.5.7.3.4": ["digitalSignature", "nonRepudiation", "keyEncipherment", "keyAgreement"],
    "1.3.6.1.5.5.7.3.8": ["digitalSignature", "nonRepudiation"],
    "1.3.6.1.5.5.7.3.9": ["digitalSignature", "nonRepudiation"],
    "1.2.840.113583.1.1.10": ["digitalSignature"],
    "1.3.6.1.4.1.311.80.1": ["keyEncipherment", "dataEncipherment", "keyAgreement"],
  };
  for (const oid of extendedKeyUsage.oids) {
    if (keyUsage.usages.length && consistent[oid] && !consistent[oid].some(has))
      add(
        "extendedKeyUsage.oids",
        "incompatible",
        `Extended key usage ${oid} is incompatible with the selected key usages.`,
      );
  }
  if (extendedKeyUsage.oids.includes("2.5.29.37.0") && extendedKeyUsage.critical)
    add(
      "extendedKeyUsage.critical",
      "incompatible",
      "Any extended key usage must not be marked critical.",
    );
  if (extendedKeyUsage.oids.includes("1.3.6.1.5.5.7.3.4") && !allowMissingIdentity) {
    let subjectEmails: string[] = [];
    try {
      subjectEmails = new Name(subject).getField("E");
    } catch {
      /* Reported by subject validation. */
    }
    if (!san.entries.some((entry) => entry.type === "email") && !subjectEmails.length)
      add("san.entries", "required", "S/MIME requires an email SAN or a subject email (E).");
  }
  if (validity.mode === "relative" && (!Number.isFinite(validity.days) || validity.days <= 0))
    add("validity.days", "invalid", "Validity days must be positive and finite.");
  const [notBefore, notAfter] = validityDates(configuration, context?.now ?? new Date());
  const dateField = validity.mode === "relative" ? "validity.days" : "validity.notAfter";
  if (!Number.isFinite(notBefore.getTime()))
    add("validity.notBefore", "invalid", "Enter a valid start date with an explicit time zone.");
  if (!Number.isFinite(notAfter.getTime()) || notAfter.getUTCFullYear() > 9999)
    add(
      dateField,
      "invalid",
      "Enter a valid end date with an explicit time zone, no later than year 9999.",
    );
  if (notAfter.getTime() - notBefore.getTime() < 1000)
    add(dateField, "order", "The end date must be at least one second after the start date.");
  if (context) {
    const ca = context.caCertificate;
    if (
      !ca.getExtension(BasicConstraintsExtension)?.ca ||
      !((ca.getExtension(KeyUsagesExtension)?.usages ?? 0) & KeyUsageFlags.keyCertSign)
    )
      add("issuer", "not-ca", "The selected issuer must be a CA permitted to sign certificates.");
    if (notBefore < ca.notBefore)
      add(
        "validity.notBefore",
        "outside-ca",
        "Certificate validity begins before the CA certificate validity.",
      );
    if (notAfter > ca.notAfter)
      add(
        dateField,
        "outside-ca",
        "Certificate validity ends after the CA certificate expires; choose a shorter duration or earlier end date.",
      );
    const algorithm = context.publicKey.algorithm.name;
    const rsa = algorithm === "RSASSA-PKCS1-v1_5" || algorithm === "RSA-OAEP";
    const ec = algorithm === "ECDSA" || algorithm === "ECDH";
    const signingOnly = algorithm === "Ed25519" || algorithm === "RSA-PSS";
    if (!rsa && !ec && !signingOnly)
      add(
        "publicKey",
        "unsupported",
        `Unsupported certificate public key algorithm: ${algorithm}.`,
      );
    if (!rsa && (has("keyEncipherment") || has("dataEncipherment")))
      add(
        "keyUsage.usages",
        "incompatible",
        "RSA encipherment usages require an RSA encryption public key; use key agreement for EC encryption.",
      );
    if (!ec && (has("keyAgreement") || has("encipherOnly") || has("decipherOnly")))
      add("keyUsage.usages", "incompatible", "Key agreement usages require an EC public key.");
  }
  return issues;
}

export function validateX509Configuration(
  value: unknown,
  context?: CertificateValidationContext,
): ValidationIssue[] {
  const { configuration, issues } = readShape(value);
  return issues.length ? issues : semanticIssues(configuration, context);
}

export function parseX509Configuration(
  value: unknown,
  options: { allowMissingIdentity?: boolean } = {},
): X509Configuration {
  const { configuration, issues } = readShape(value);
  if (!issues.length)
    issues.push(...semanticIssues(configuration, undefined, options.allowMissingIdentity));
  if (issues.length) throw new CertificateValidationError(issues);
  return configuration;
}

export function resolveCertificateConfiguration(
  configuration: X509Configuration,
  context: CertificateValidationContext,
): ResolvedX509Configuration {
  const resolvedContext = { ...context, now: context.now ?? new Date() };
  const issues = validateX509Configuration(configuration, resolvedContext);
  if (issues.length) throw new CertificateValidationError(issues);
  const copy = cloneConfiguration(configuration);
  const [start, end] = validityDates(copy, resolvedContext.now);
  const { validity: _validity, ...settings } = copy;
  return {
    ...settings,
    notBefore: new Date(Math.floor(start.getTime() / 1000) * 1000).toISOString(),
    notAfter: new Date(Math.floor(end.getTime() / 1000) * 1000).toISOString(),
  };
}

export function convertToRelativeValidity(configuration: X509Configuration): X509Configuration {
  const copy = cloneConfiguration(configuration);
  if (copy.validity.mode === "exact") {
    const start = parseDate(copy.validity.notBefore).getTime();
    const end = parseDate(copy.validity.notAfter).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
      throw new CertificateValidationError([
        {
          field: "validity",
          code: "invalid",
          message: "Valid exact dates are required before converting to a relative duration.",
        },
      ]);
    copy.validity = { mode: "relative", days: (end - start) / MILLISECONDS_PER_DAY };
  }
  return copy;
}
