import * as x509 from "@peculiar/x509";
import { expect, test } from "vitest";
import { issueCertificate } from "./issuer";
import { parseCertificateInput } from "./input";
import { createPresetConfiguration } from "./presets";
import { resolveCertificateConfiguration } from "./validation";
import { asPublicKey, createTestCa, createTestKeys, TEST_NOW } from "./test-helpers";

test.each(["rsa", "ec"] as const)(
  "issues verifiable %s-key certificates with configured extensions and generated identity fields",
  async (kind) => {
    const ca = await createTestCa(kind);
    const keys = await createTestKeys(kind);
    const publicKey = await asPublicKey(keys.publicKey);
    const config = createPresetConfiguration("none", {
      subject: "O=GoodKey, C=US",
      validityDays: 7,
      keyAlgorithm: publicKey.algorithm.name,
    });
    config.san = {
      entries: [
        { type: "dns", value: "example.com" },
        { type: "ip", value: "192.0.2.1" },
        { type: "ip", value: "2001:db8::1" },
        { type: "email", value: "signer@example.com" },
        { type: "url", value: "urn:example:signer" },
      ],
      critical: true,
    };
    config.keyUsage = {
      usages:
        kind === "rsa"
          ? ["digitalSignature", "keyEncipherment"]
          : ["digitalSignature", "keyAgreement"],
      critical: false,
    };
    config.extendedKeyUsage = { oids: ["1.3.6.1.5.5.7.3.1", "1.2.3.4.5"], critical: true };
    const resolved = resolveCertificateConfiguration(config, {
      caCertificate: ca.certificate,
      publicKey,
      now: TEST_NOW,
    });
    const certificate = await issueCertificate({
      caCertificate: ca.certificate,
      signingKey: ca.keys.privateKey,
      publicKey,
      configuration: resolved,
    });
    const parsed = new x509.X509Certificate(certificate.toString("pem"));
    expect(await parsed.verify({ publicKey: ca.certificate.publicKey, signatureOnly: true })).toBe(
      true,
    );
    expect(parsed.subject).toBe(config.subject);
    expect(parsed.issuer).toBe(ca.certificate.subject);
    expect(parsed.publicKey.toString("hex")).toBe(publicKey.toString("hex"));
    expect(parsed.notBefore.toISOString()).toBe(resolved.notBefore);
    expect(parsed.notAfter.toISOString()).toBe(resolved.notAfter);
    expect(parsed.getExtension(x509.BasicConstraintsExtension)).toMatchObject({
      ca: false,
      critical: true,
      pathLength: undefined,
    });
    expect(parsed.getExtension(x509.SubjectAlternativeNameExtension)?.names.toJSON()).toEqual(
      config.san.entries,
    );
    expect(parsed.getExtension(x509.KeyUsagesExtension)?.critical).toBe(false);
    expect(parsed.getExtension(x509.ExtendedKeyUsageExtension)).toMatchObject({
      usages: config.extendedKeyUsage.oids,
      critical: true,
    });
    expect(parsed.getExtension(x509.SubjectKeyIdentifierExtension)?.keyId).toBeTruthy();
    expect(parsed.getExtension(x509.AuthorityKeyIdentifierExtension)?.keyId).toBe(
      ca.certificate.getExtension(x509.SubjectKeyIdentifierExtension)?.keyId,
    );
    const next = await issueCertificate({
      caCertificate: ca.certificate,
      signingKey: ca.keys.privateKey,
      publicKey,
      configuration: resolved,
    });
    expect(next.serialNumber).not.toBe(parsed.serialNumber);
  },
);

test("omits KU/EKU rather than encoding empty extensions, and permits a SAN-only subject", async () => {
  const ca = await createTestCa();
  const publicKey = await asPublicKey((await createTestKeys()).publicKey);
  const config = createPresetConfiguration("none", { subject: "" });
  config.san = { entries: [{ type: "dns", value: "example.com" }], critical: true };
  config.keyUsage = { usages: [], critical: false };
  const certificate = await issueCertificate({
    caCertificate: ca.certificate,
    signingKey: ca.keys.privateKey,
    publicKey,
    configuration: resolveCertificateConfiguration(config, {
      caCertificate: ca.certificate,
      publicKey,
      now: TEST_NOW,
    }),
  });
  expect(certificate.subject).toBe("");
  expect(certificate.getExtension(x509.KeyUsagesExtension)).toBeNull();
  expect(certificate.getExtension(x509.ExtendedKeyUsageExtension)).toBeNull();
  expect(
    await certificate.verify({ publicKey: ca.certificate.publicKey, signatureOnly: true }),
  ).toBe(true);
});

test("CSR requested identity and extensions are not implicitly issued", async () => {
  const ca = await createTestCa();
  const request = await x509.Pkcs10CertificateRequestGenerator.create({
    name: "CN=Unreviewed request",
    keys: await createTestKeys(),
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    extensions: [
      new x509.BasicConstraintsExtension(true),
      new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "unreviewed.example.com" }]),
      new x509.Extension("1.2.3.4", true, new Uint8Array([5, 0])),
    ],
  });
  const input = await parseCertificateInput(request.toString("pem"));
  const configuration = resolveCertificateConfiguration(
    createPresetConfiguration("code_signing", { subject: "CN=Reviewed signer" }),
    { caCertificate: ca.certificate, publicKey: input.publicKey, now: TEST_NOW },
  );
  const certificate = await issueCertificate({
    caCertificate: ca.certificate,
    signingKey: ca.keys.privateKey,
    publicKey: input.publicKey,
    configuration,
  });
  expect(certificate.subject).toBe("CN=Reviewed signer");
  expect(certificate.getExtension(x509.BasicConstraintsExtension)?.ca).toBe(false);
  expect(certificate.getExtension(x509.SubjectAlternativeNameExtension)).toBeNull();
  expect(certificate.getExtension("1.2.3.4")).toBeNull();
});

test("revalidates resolved configuration and rejects mismatched CA signing keys", async () => {
  const ca = await createTestCa();
  const publicKey = await asPublicKey((await createTestKeys()).publicKey);
  const configuration = resolveCertificateConfiguration(createPresetConfiguration(), {
    caCertificate: ca.certificate,
    publicKey,
    now: TEST_NOW,
  });
  const options = {
    caCertificate: ca.certificate,
    signingKey: ca.keys.privateKey,
    publicKey,
    configuration,
  };
  await expect(
    issueCertificate({
      ...options,
      configuration: { ...configuration, notAfter: "2050-01-01T00:00:00.000Z" },
    }),
  ).rejects.toMatchObject({
    issues: expect.arrayContaining([expect.objectContaining({ code: "outside-ca" })]),
  });
  await expect(
    issueCertificate({ ...options, signingKey: (await createTestKeys()).privateKey }),
  ).rejects.toMatchObject({ issues: [expect.objectContaining({ code: "key-mismatch" })] });
});

test.each([
  ["2025-01-01T00:00:00.000Z", "2025-02-01T00:00:00.000Z"],
  ["2035-01-01T00:00:00.000Z", "2035-02-01T00:00:00.000Z"],
])(
  "issues exact historical or future validity %s without misreporting a signing-key mismatch",
  async (notBefore, notAfter) => {
    const ca = await createTestCa();
    const publicKey = await asPublicKey((await createTestKeys()).publicKey);
    const config = createPresetConfiguration();
    config.validity = { mode: "exact", notBefore, notAfter };
    const certificate = await issueCertificate({
      caCertificate: ca.certificate,
      signingKey: ca.keys.privateKey,
      publicKey,
      configuration: resolveCertificateConfiguration(config, {
        caCertificate: ca.certificate,
        publicKey,
      }),
    });
    expect(certificate.notBefore.toISOString()).toBe(notBefore);
    expect(certificate.notAfter.toISOString()).toBe(notAfter);
    expect(
      await certificate.verify({ publicKey: ca.certificate.publicKey, signatureOnly: true }),
    ).toBe(true);
  },
);
