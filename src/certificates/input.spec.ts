import * as x509 from "@peculiar/x509";
import { expect, test } from "vitest";
import { parseCertificateInput } from "./input";
import { asPublicKey, createTestCa, createTestKeys } from "./test-helpers";

async function createRequest(extensions: x509.Extension[] = []) {
  return x509.Pkcs10CertificateRequestGenerator.create({
    name: "CN=Requested signer, E=csr@example.com",
    keys: await createTestKeys(),
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    extensions,
  });
}

test.each(["pem", "der"] as const)(
  "verifies a %s CSR and exposes requested data separately",
  async (format) => {
    const request = await createRequest([
      new x509.SubjectAlternativeNameExtension(
        [
          { type: "dns", value: "requested.example.com" },
          { type: "email", value: "csr@example.com" },
        ],
        true,
      ),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.codeSigning]),
      new x509.BasicConstraintsExtension(false),
    ]);
    const input = format === "pem" ? request.toString("pem") : new Uint8Array(request.rawData);
    const original = typeof input === "string" ? input : input.slice();
    const parsed = await parseCertificateInput(input);
    expect(parsed).toMatchObject({
      type: "csr",
      format,
      csrSignatureVerified: true,
      metadata: { algorithm: "ECDSA", namedCurve: "P-256" },
    });
    expect(parsed.raw).toEqual(input);
    expect(parsed.requested).toMatchObject({
      subject: request.subject,
      san: {
        entries: [
          { type: "dns", value: "requested.example.com" },
          { type: "email", value: "csr@example.com" },
        ],
        critical: true,
      },
      keyUsage: { usages: ["digitalSignature"], critical: true },
      extendedKeyUsage: { oids: [x509.ExtendedKeyUsage.codeSigning], critical: false },
    });
    expect(parsed.metadata.fingerprint).toHaveLength(64);
    if (input instanceof Uint8Array) {
      input.fill(0);
    }
    expect(parsed.raw).toEqual(original);
  },
);

test("reports unsupported CSR extensions and SAN name types without applying them", async () => {
  const request = await createRequest([
    new x509.SubjectAlternativeNameExtension([
      { type: "dns", value: "example.com" },
      { type: "id", value: "1.2.3.4" },
    ]),
    new x509.Extension("1.2.3.4", true, new Uint8Array([5, 0])),
    new x509.BasicConstraintsExtension(true, 0, true),
    new x509.KeyUsagesExtension(
      x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.digitalSignature,
      true,
    ),
  ]);
  const parsed = await parseCertificateInput(request.toString("pem"));
  expect(parsed.requested?.san.entries).toEqual([{ type: "dns", value: "example.com" }]);
  expect(parsed.requested?.notices.join(" ")).toContain("unsupported name type");
  expect(parsed.requested?.notices.join(" ")).toContain("1.2.3.4 (critical)");
  expect(parsed.requested?.notices.join(" ")).toContain("CA certificate");
  expect(parsed.requested?.notices.join(" ")).toContain("CRL signing");
  expect(
    parsed.requested?.extensions.find((extension) => extension.oid === "1.2.3.4")?.supported,
  ).toBe(false);
});

test("rejects tampered CSR signatures instead of falling back to another input type", async () => {
  const request = await createRequest();
  const corrupted = new Uint8Array(request.rawData.slice(0));
  corrupted[corrupted.length - 1] ^= 1;
  await expect(parseCertificateInput(corrupted)).rejects.toMatchObject({
    issues: [expect.objectContaining({ field: "input", code: "invalid-signature" })],
  });
});

test("rejects duplicate requested extension OIDs", async () => {
  const request = await createRequest([
    new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature),
    new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyEncipherment),
  ]);
  await expect(parseCertificateInput(request.toString("pem"))).rejects.toMatchObject({
    issues: [expect.objectContaining({ code: "duplicate-extension" })],
  });
});

test.each(["pem", "der"] as const)(
  "accepts %s SPKI and X.509 certificate public keys",
  async (format) => {
    const ca = await createTestCa("rsa");
    const publicKey = await asPublicKey(ca.keys.publicKey);
    for (const [type, object] of [
      ["spki", publicKey],
      ["certificate", ca.certificate],
    ] as const) {
      const parsed = await parseCertificateInput(
        format === "pem" ? object.toString("pem") : object.rawData,
      );
      expect(parsed.type).toBe(type);
      expect(parsed.requested).toBeUndefined();
      expect(parsed.metadata).toMatchObject({
        algorithm: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        label: "RSA 2048",
      });
      expect(parsed.publicKey.toString("hex")).toBe(publicKey.toString("hex"));
    }
  },
);

test("detects PEM text uploaded as a file while preserving its bytes", async () => {
  const request = await createRequest();
  const bytes = new TextEncoder().encode(request.toString("pem"));
  const parsed = await parseCertificateInput(bytes);
  expect(parsed.format).toBe("pem");
  expect(Array.from(parsed.raw as Uint8Array)).toEqual(Array.from(bytes));
});

test("rejects malformed, concatenated, trailing, private-key, and oversized inputs", async () => {
  const request = await createRequest();
  const trailing = new Uint8Array(request.rawData.byteLength + 1);
  trailing.set(new Uint8Array(request.rawData));
  for (const invalid of [
    "",
    "not a certificate",
    `${request}\n${request}`,
    "-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----",
    trailing,
    new Uint8Array([0x30, 0xff]),
    "a".repeat(1_048_577),
  ]) {
    await expect(parseCertificateInput(invalid)).rejects.toMatchObject({
      name: "CertificateValidationError",
    });
  }
});
