import * as x509 from "@peculiar/x509";
import { Convert } from "pvtsutils";
import { CertificateValidationError, type ResolvedX509Configuration } from "./types";
import { resolveCertificateConfiguration } from "./validation";

export interface IssueCertificateOptions {
  caCertificate: x509.X509Certificate;
  signingKey: CryptoKey;
  publicKey: x509.PublicKey;
  configuration: ResolvedX509Configuration;
}

function signingAlgorithm(key: CryptoKey): Algorithm | EcdsaParams | RsaPssParams {
  if (key.algorithm.name === "ECDSA") {
    const curve = (key.algorithm as EcKeyAlgorithm).namedCurve;
    const hash = { "P-256": "SHA-256", "P-384": "SHA-384", "P-521": "SHA-512" }[curve];
    if (hash) return { name: "ECDSA", hash };
  }
  if (key.algorithm.name === "RSASSA-PKCS1-v1_5" || key.algorithm.name === "RSA-PSS") {
    const algorithm = key.algorithm as RsaHashedKeyAlgorithm;
    if (key.algorithm.name === "RSA-PSS") {
      const saltLength = { "SHA-256": 32, "SHA-384": 48, "SHA-512": 64 }[algorithm.hash.name];
      if (saltLength) return { name: "RSA-PSS", saltLength };
    } else return { name: algorithm.name, hash: algorithm.hash } as RsaHashedImportParams;
  }
  throw new CertificateValidationError([
    {
      field: "issuer",
      code: "unsupported",
      message: "The CA signing key algorithm is unsupported.",
    },
  ]);
}

export async function issueCertificate(
  options: IssueCertificateOptions,
): Promise<x509.X509Certificate> {
  const { caCertificate, signingKey, publicKey } = options;
  const { notBefore, notAfter, ...settings } = options.configuration;
  const configuration = resolveCertificateConfiguration(
    { ...settings, validity: { mode: "exact", notBefore, notAfter } },
    { caCertificate, publicKey },
  );
  if (signingKey.type !== "private" || !signingKey.usages.includes("sign")) {
    throw new CertificateValidationError([
      {
        field: "issuer",
        code: "invalid-key",
        message: "The CA requires a private key permitted to sign.",
      },
    ]);
  }
  const extensions: x509.Extension[] = [
    new x509.BasicConstraintsExtension(false, undefined, true),
    await x509.AuthorityKeyIdentifierExtension.create(caCertificate),
    await x509.SubjectKeyIdentifierExtension.create(publicKey),
  ];
  if (configuration.san.entries.length)
    extensions.push(
      new x509.SubjectAlternativeNameExtension(
        configuration.san.entries,
        configuration.san.critical,
      ),
    );
  if (configuration.keyUsage.usages.length) {
    const flags = configuration.keyUsage.usages.reduce(
      (value, usage) => value | x509.KeyUsageFlags[usage],
      0,
    );
    extensions.push(new x509.KeyUsagesExtension(flags, configuration.keyUsage.critical));
  }
  if (configuration.extendedKeyUsage.oids.length)
    extensions.push(
      new x509.ExtendedKeyUsageExtension(
        configuration.extendedKeyUsage.oids,
        configuration.extendedKeyUsage.critical,
      ),
    );
  const serial = crypto.getRandomValues(new Uint8Array(16));
  serial[0] &= 0x7f;
  if (!serial.some((octet) => octet !== 0)) serial[15] = 1;
  const certificate = await x509.X509CertificateGenerator.create({
    subject: configuration.subject,
    issuer: caCertificate.subjectName,
    notBefore: new Date(configuration.notBefore),
    notAfter: new Date(configuration.notAfter),
    serialNumber: Convert.ToHex(serial),
    signingAlgorithm: signingAlgorithm(signingKey),
    publicKey,
    signingKey,
    extensions,
  });
  if (!(await certificate.verify({ publicKey: caCertificate.publicKey, signatureOnly: true }))) {
    throw new CertificateValidationError([
      {
        field: "issuer",
        code: "key-mismatch",
        message: "The signing key does not match the CA certificate.",
      },
    ]);
  }
  return certificate;
}
