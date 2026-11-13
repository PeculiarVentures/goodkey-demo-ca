import { Name } from "@peculiar/x509";
import { beforeEach, describe, expect, test } from "vitest";
import { createPresetConfiguration } from "./presets";
import {
  CertificateValidationError,
  type CertificateValidationContext,
  type X509Configuration,
} from "./types";
import {
  convertToRelativeValidity,
  parseX509Configuration,
  resolveCertificateConfiguration,
  validateSubject,
  validateX509Configuration,
} from "./validation";
import { asPublicKey, createTestCa, TEST_NOW } from "./test-helpers";

let context: CertificateValidationContext;
beforeEach(async () => {
  const ca = await createTestCa();
  context = {
    caCertificate: ca.certificate,
    publicKey: await asPublicKey(ca.keys.publicKey),
    now: TEST_NOW,
  };
});

function issues(configuration: X509Configuration) {
  return validateX509Configuration(configuration, context);
}

describe("subject DN validation", () => {
  test.each(["CN=Example, C=U", "CN=Example, E=partial"])(
    "allows semantic drafts only in explicit syntax mode: %s",
    (subject) => {
      expect(validateSubject(subject)).toBeDefined();
      expect(validateSubject(subject, { syntaxOnly: true })).toBeUndefined();
      expect(issues({ ...createPresetConfiguration(), subject })).toContainEqual(
        expect.objectContaining({ field: "subject", code: "invalid" }),
      );
    },
  );
  test.each(["CN=Demo, ignored text", "1.40=Example", "CN=Alice\\2CBob", "CN=Bad\nName", "CN=#ff"])(
    "retains syntax protections in explicit syntax mode: %s",
    (subject) => {
      expect(validateSubject(subject, { syntaxOnly: true })).toBeDefined();
    },
  );
  test.each([
    "CN=",
    "not a DN",
    "CN=Demo, ignored text",
    "CN=Demo,",
    "1.40=Example",
    "9.9=Example",
    "2.01.3=Example",
    "CN=Alice\\2CBob",
    "CN=Jos\\C3\\A9",
    "CN=#ff",
    "CN=#00",
    "CN=#0c0100",
    "CN=#0c010a",
    "CN=#0c00",
    'CN="unterminated',
    "C=USA",
    "E=bad@@example.com",
  ])("rejects %s instead of silently changing it", (subject) => {
    expect(validateSubject(subject)).toBeTypeOf("string");
  });
  test.each([
    "O=GoodKey, C=US",
    "CN=Alice\\,Bob",
    "CN=José",
    'CN="Alice,Bob"',
    "1.2.3.4=Custom",
    "CN=Demo+OU=Team, O=GoodKey",
  ])("accepts and round-trips %s", (subject) => {
    expect(validateSubject(subject)).toBeUndefined();
    const name = new Name(subject);
    expect(new Name(name.toArrayBuffer()).toJSON()).toEqual(name.toJSON());
  });
  test("accepts a valid DER-encoded attribute value after decoding its semantics", () => {
    const subject = "CN=#0c03416263";
    expect(validateSubject(subject)).toBeUndefined();
    expect(new Name(new Name(subject).toArrayBuffer()).getField("CN")).toEqual(["Abc"]);
  });
  test("allows an empty subject only with a non-empty critical SAN", () => {
    const config = createPresetConfiguration();
    config.subject = "";
    expect(issues(config)).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "subject" })]),
    );
    config.san = { entries: [{ type: "dns", value: "example.com" }], critical: true };
    expect(issues(config)).toEqual([]);
  });
});

test.each([0, -1, NaN, Infinity])("rejects invalid relative duration %s", (days) => {
  const config = createPresetConfiguration("none", { validityDays: days });
  expect(issues(config)).toEqual(
    expect.arrayContaining([expect.objectContaining({ field: "validity.days" })]),
  );
});

test("resolves relative dates once and rejects CA validity overflow", () => {
  const config = createPresetConfiguration("none", { validityDays: 30 });
  expect(resolveCertificateConfiguration(config, context)).toMatchObject({
    notBefore: TEST_NOW.toISOString(),
    notAfter: "2026-12-13T12:00:00.000Z",
  });
  config.validity = { mode: "relative", days: 10_000 };
  expect(issues(config)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "validity.days", code: "outside-ca" }),
    ]),
  );
});

test.each([
  ["2026-02-30T00:00:00Z", "2027-01-01T00:00:00Z", "validity.notBefore"],
  ["2026-11-13T00:00:00", "2027-01-01T00:00:00Z", "validity.notBefore"],
  ["2026-11-13T00:00:00Z", "invalid", "validity.notAfter"],
  ["2026-11-13T00:00:00Z", "2026-11-12T00:00:00Z", "validity.notAfter"],
  ["2019-01-01T00:00:00Z", "2026-11-13T00:00:00Z", "validity.notBefore"],
  ["2026-11-13T00:00:00Z", "2041-01-01T00:00:00Z", "validity.notAfter"],
])("rejects exact dates %s to %s", (notBefore, notAfter, field) => {
  const config = createPresetConfiguration();
  config.validity = { mode: "exact", notBefore, notAfter };
  expect(issues(config)).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
});

test("exact dates have explicit conversion to a portable relative duration", () => {
  const config = createPresetConfiguration();
  config.validity = {
    mode: "exact",
    notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2026-01-31T00:00:00.000Z",
  };
  expect(convertToRelativeValidity(config).validity).toEqual({ mode: "relative", days: 30 });
  expect(config.validity.mode).toBe("exact");
});

test.each([
  ["dns", "bad_name.example"],
  ["dns", "a..example"],
  ["dns", "*.*.example"],
  ["email", "bad@@example.com"],
  ["email", "hello world@example.com"],
  ["ip", "256.1.2.3"],
  ["ip", "01.2.3.4"],
  ["ip", "2001:::1"],
  ["url", "/relative"],
  ["url", "https://example.com/with space"],
] as const)("rejects invalid %s SAN %s", (type, value) => {
  const config = createPresetConfiguration();
  config.san.entries = [{ type, value }];
  expect(issues(config)).toEqual(
    expect.arrayContaining([expect.objectContaining({ field: "san.entries.0.value" })]),
  );
});

test("validates duplicate and valid SANs including IPv6", () => {
  const config = createPresetConfiguration();
  config.san.entries = [
    { type: "dns", value: "*.example.com" },
    { type: "ip", value: "2001:db8::1" },
    { type: "email", value: "user@example.com" },
    { type: "url", value: "urn:example:signer" },
  ];
  expect(issues(config)).toEqual([]);
  config.san.entries.push({ type: "ip", value: "2001:0db8:0:0:0:0:0:1" });
  expect(issues(config)).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: "duplicate" })]),
  );
});

test("distinguishes omitted KU/EKU from an invalid empty critical extension", () => {
  const config = createPresetConfiguration();
  config.keyUsage = { usages: [], critical: false };
  expect(issues(config)).toEqual([]);
  config.keyUsage.critical = true;
  config.extendedKeyUsage.critical = true;
  expect(issues(config).map((issue) => issue.field)).toEqual(
    expect.arrayContaining(["keyUsage.usages", "extendedKeyUsage.oids"]),
  );
});

test("checks KU dependencies and key compatibility", () => {
  const config = createPresetConfiguration();
  config.keyUsage.usages = ["keyEncipherment"];
  expect(issues(config)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "keyUsage.usages", code: "incompatible" }),
    ]),
  );
  config.keyUsage.usages = ["encipherOnly"];
  expect(issues(config)).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: "incompatible" })]),
  );
  config.keyUsage.usages = ["keyAgreement", "encipherOnly"];
  expect(issues(config)).toEqual([]);
});

test("checks standard EKU compatibility, malformed and duplicate OIDs", () => {
  const config = createPresetConfiguration("code_signing");
  config.keyUsage.usages = ["keyAgreement"];
  expect(issues(config)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "extendedKeyUsage.oids", code: "incompatible" }),
    ]),
  );
  config.keyUsage.usages = ["digitalSignature"];
  config.extendedKeyUsage.oids = ["1.2.3.4", "1.2.3.4", "1.40", "9.9"];
  expect(issues(config).map((issue) => issue.code)).toEqual(
    expect.arrayContaining(["duplicate", "invalid"]),
  );
});

test("S/MIME accepts email SAN independently from a DN email", () => {
  const config = createPresetConfiguration("smime", {
    subject: "CN=Signer",
    email: "user@example.com",
    keyAlgorithm: "ECDSA",
  });
  expect(issues(config)).toEqual([]);
  expect(config.keyUsage.usages).not.toContain("keyEncipherment");
});

test("rejects unmodeled generated fields and CA key usages", () => {
  expect(() =>
    parseX509Configuration({ ...createPresetConfiguration(), issuer: "CN=Injected CA" }),
  ).toThrow(CertificateValidationError);
  const config = {
    ...createPresetConfiguration(),
    keyUsage: { usages: ["keyCertSign"], critical: true },
  };
  expect(validateX509Configuration(config)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "keyUsage.usages", code: "unsupported" }),
    ]),
  );
});
