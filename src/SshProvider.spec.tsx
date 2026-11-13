import { act, renderHook, waitFor } from "@testing-library/react";
import * as ssh from "@peculiar/ssh";
import { expect, test } from "vitest";
import { SshProvider, useSshCaContext } from "./SshProvider";

test("a stored SSH CA key can issue a verifiable certificate after reload", async () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SshProvider name="Demo SSH CA">{children}</SshProvider>
  );
  const initial = renderHook(useSshCaContext, { wrapper });
  act(() => initial.result.current.initialize("Demo SSH CA", "ed25519"));
  await waitFor(() => expect(initial.result.current.value).toBeDefined());
  const caPublicKey = initial.result.current.value?.publicKey;
  initial.unmount();

  const reloaded = renderHook(useSshCaContext, { wrapper });
  await waitFor(() => expect(reloaded.result.current.value?.publicKey).toBe(caPublicKey));
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicKey = await ssh.SshPublicKey.fromWebCrypto(keys.publicKey);
  const certificateText = await reloaded.result.current.enrollCertificate(await publicKey.toSSH(), {
    certType: "user",
    keyId: "demo-user",
    principals: ["demo"],
    validAfter: new Date(Date.now() - 60_000),
    validBefore: new Date(Date.now() + 86_400_000),
  });
  const certificate = await ssh.SshCertificate.fromSSH(certificateText);

  expect(await certificate.verify(await ssh.SshPublicKey.fromSSH(caPublicKey!))).toBe(true);
  expect(certificate.certType).toBe("user");
  expect(certificate.keyId).toBe("demo-user");
  expect(certificate.principals).toEqual(["demo"]);
});
