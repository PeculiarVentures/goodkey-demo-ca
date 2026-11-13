import * as x509 from "@peculiar/x509";

export const TEST_NOW = new Date("2026-11-13T12:00:00.000Z");

export async function createTestKeys(
  kind: "rsa" | "ec" | "ed25519" = "ec",
): Promise<CryptoKeyPair> {
  if (kind === "rsa")
    return crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      false,
      ["sign", "verify"],
    );
  if (kind === "ed25519")
    return crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
  return crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function createTestCa(kind: "rsa" | "ec" = "ec") {
  const keys = await createTestKeys(kind);
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    name: "CN=Test CA, O=GoodKey, C=US",
    notBefore: new Date("2020-01-01T00:00:00Z"),
    notAfter: new Date("2040-01-01T00:00:00Z"),
    keys,
    signingAlgorithm: { name: keys.privateKey.algorithm.name, hash: "SHA-256" },
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true,
      ),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });
  return { certificate, keys };
}

export async function asPublicKey(key: CryptoKey): Promise<x509.PublicKey> {
  return new x509.PublicKey(await crypto.subtle.exportKey("spki", key));
}
