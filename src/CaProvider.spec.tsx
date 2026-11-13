import { act, renderHook, waitFor } from "@testing-library/react";
import * as x509 from "@peculiar/x509";
import { expect, test } from "vitest";
import { CaProvider, useCaContext } from "./CaProvider";
import { createPresetConfiguration } from "./certificates/presets";

test("a stored X.509 CA key can issue a verifiable certificate after reload", async () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CaProvider name="Demo CA">{children}</CaProvider>
  );
  const initial = renderHook(useCaContext, { wrapper });
  act(() => initial.result.current.initialize("CN=Demo CA", "ecp256"));
  await waitFor(() => expect(initial.result.current.value).toBeDefined());
  const rootPem = initial.result.current.value?.cert;
  expect(initial.result.current.value?.key.extractable).toBe(false);
  initial.unmount();

  const reloaded = renderHook(useCaContext, { wrapper });
  await waitFor(() => expect(reloaded.result.current.value?.cert).toBe(rootPem));
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicKey = new x509.PublicKey(await crypto.subtle.exportKey("spki", keys.publicKey));
  const certificate = await reloaded.result.current.enrollCertificate(
    publicKey,
    createPresetConfiguration("code_signing", {
      subject: "CN=Demo signer",
      validityDays: 30,
      keyAlgorithm: publicKey.algorithm.name,
    }),
  );

  const root = new x509.X509Certificate(rootPem!);
  expect(await certificate.verify({ publicKey: root.publicKey })).toBe(true);
  expect(certificate.subject).toBe("CN=Demo signer");
  expect(certificate.getExtension(x509.ExtendedKeyUsageExtension)?.usages).toContain(
    x509.ExtendedKeyUsage.codeSigning,
  );
});
