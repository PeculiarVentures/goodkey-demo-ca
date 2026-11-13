import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as x509 from "@peculiar/x509";
import { SnackbarProvider } from "notistack";
import { beforeEach, expect, test, vi } from "vitest";
import { AppProvider, useApplicationContext } from "./AppProvider";
import { CaContext, type CaContextProps } from "./CaProvider";
import { CaIssueCertificateView } from "./CaIssueCertificateView";
import {
  CertificateTemplateStore,
  createPresetConfiguration,
  issueCertificate,
  resolveCertificateConfiguration,
  TEMPLATE_STORAGE_KEY,
} from "./certificates";
import { createTestCa, createTestKeys } from "./certificates/test-helpers";
import { TemplateManager } from "./certificate-ui/TemplateManager";
import * as fileHelpers from "./certificate-ui/files";

beforeEach(() => localStorage.clear());

async function fixture() {
  const ca = await createTestCa();
  const keys = await createTestKeys();
  const request = await x509.Pkcs10CertificateRequestGenerator.create({
    name: "CN=requested.example, O=Requester",
    keys,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    extensions: [
      new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "requested.example" }]),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.codeSigning]),
    ],
  });
  const enrollCertificate = vi.fn<CaContextProps["enrollCertificate"]>((publicKey, configuration) =>
    issueCertificate({
      caCertificate: ca.certificate,
      signingKey: ca.keys.privateKey,
      publicKey,
      configuration: resolveCertificateConfiguration(configuration, {
        caCertificate: ca.certificate,
        publicKey,
      }),
    }),
  );
  const context: CaContextProps = {
    name: "Demo CA",
    value: {
      id: "Demo CA",
      name: "Demo CA",
      cert: ca.certificate.toString("pem"),
      key: ca.keys.privateKey,
    },
    initialize: vi.fn<() => void>(),
    remove: vi.fn<() => void>(),
    download: vi.fn<() => void>(),
    enrollCertificate,
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SnackbarProvider>
      <AppProvider>
        <CaContext.Provider value={context}>{children}</CaContext.Provider>
      </AppProvider>
    </SnackbarProvider>
  );
  return { ca, request, enrollCertificate, wrapper };
}

async function importPem(request: x509.Pkcs10CertificateRequest) {
  fireEvent.change(screen.getByLabelText("Certificate request or public key (PEM)"), {
    target: { value: request.toString("pem") },
  });
  await screen.findByText(/CSR signature verified/);
  fireEvent.click(screen.getByRole("button", { name: "Configure certificate" }));
}

async function selectOption(label: RegExp | string, name: RegExp | string) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name }));
}

async function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

function captureDownloads() {
  const blobs: Blob[] = [];
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn<(blob: Blob) => string>((blob) => {
        blobs.push(blob);
        return "blob:test";
      }),
      revokeObjectURL: vi.fn<() => void>(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return blobs;
}

test("imports a verified CSR, preserves edits through modes and back, reviews and downloads a real certificate", async () => {
  const { ca, request, enrollCertificate, wrapper } = await fixture();
  const blobs = captureDownloads();
  const clipboard = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboard },
    configurable: true,
  });
  render(<CaIssueCertificateView />, { wrapper });
  await importPem(request);
  expect((screen.getByLabelText("Common name") as HTMLInputElement).value).toBe("Test certificate");
  fireEvent.click(screen.getByRole("button", { name: "Apply requested subject" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply requested SAN" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply requested usages" }));
  fireEvent.change(screen.getByLabelText("Valid for (days)"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "SAN critical" }));
  const eku = screen.getByRole("combobox", { name: "Extended key usages (EKU)" });
  fireEvent.change(eku, { target: { value: "1.2.3.4.5" } });
  fireEvent.keyDown(eku, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Basic" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit full DN" }));
  const dn = "CN=edited.example, OU=First+OU=Second, 1.2.3.4=custom";
  fireEvent.change(screen.getByLabelText("Full subject distinguished name"), {
    target: { value: dn },
  });
  fireEvent.click(screen.getByRole("button", { name: "Use structured fields" }));
  expect((screen.getByLabelText("Full subject distinguished name") as HTMLInputElement).value).toBe(
    dn,
  );
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(
    (screen.getByLabelText("Certificate request or public key (PEM)") as HTMLTextAreaElement).value,
  ).toBe(request.toString("pem"));
  fireEvent.click(screen.getByRole("button", { name: "Configure certificate" }));
  expect((screen.getByLabelText("Full subject distinguished name") as HTMLInputElement).value).toBe(
    dn,
  );
  expect((screen.getByLabelText("Valid for (days)") as HTMLInputElement).value).toBe("30");
  fireEvent.click(screen.getByRole("button", { name: "Review certificate" }));
  expect(screen.getByText(/1.2.3.4.5/)).toBeTruthy();
  expect(screen.getByText(/Exact validity \(UTC\)/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Issue certificate" }));
  fireEvent.click(screen.getByRole("button", { name: /Issuing|Issue certificate/ }));
  await screen.findByText("Certificate issued successfully.");
  expect(enrollCertificate).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Download PEM" }));
  const pem = await blobText(blobs[0]);
  const cert = new x509.X509Certificate(pem);
  expect(await cert.verify({ publicKey: ca.certificate.publicKey })).toBe(true);
  expect(cert.subject).toContain("1.2.3.4=custom");
  expect(cert.getExtension(x509.SubjectAlternativeNameExtension)?.critical).toBe(true);
  expect(cert.getExtension(x509.SubjectAlternativeNameExtension)?.names.toJSON()).toEqual([
    { type: "dns", value: "requested.example" },
  ]);
  expect(cert.getExtension(x509.ExtendedKeyUsageExtension)?.usages.map(String)).toContain(
    "1.2.3.4.5",
  );
  expect(cert.notAfter.getTime() - cert.notBefore.getTime()).toBe(30 * 86_400_000);
  expect(
    within(await screen.findByRole("table", { name: "Actual certificate extensions" })).getByText(
      /1.2.3.4.5/,
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copy PEM" }));
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith(pem));
  fireEvent.click(screen.getByRole("button", { name: "Issue another" }));
  expect(
    (screen.getByRole("button", { name: "Configure certificate" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test("invalid edits clear the last valid key, stale parses cannot restore it, and DER file upload works", async () => {
  const { request, wrapper } = await fixture();
  render(<CaIssueCertificateView />, { wrapper });
  const textbox = screen.getByLabelText("Certificate request or public key (PEM)");
  fireEvent.change(textbox, { target: { value: request.toString("pem") } });
  fireEvent.change(textbox, { target: { value: "invalid replacement" } });
  await screen.findByText(/Paste one complete PEM/);
  await waitFor(() => expect(screen.queryByText(/CSR signature verified/)).toBeNull());
  expect(
    (screen.getByRole("button", { name: "Configure certificate" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Upload certificate input"), {
    target: { files: [new File([request.rawData], "request.der")] },
  });
  await screen.findByText(/CSR signature verified/);
  expect(screen.getByText("request.der")).toBeTruthy();
  expect((textbox as HTMLTextAreaElement).value).toBe("");
  fireEvent.change(textbox, { target: { value: "bad after valid" } });
  expect(
    (screen.getByRole("button", { name: "Configure certificate" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await screen.findByText(/Paste one complete PEM/);
});

test("template saves require identity opt-in, apply previews preserve omitted identity, and reload retains templates", async () => {
  const { request, wrapper } = await fixture();
  const rendered = render(<CaIssueCertificateView />, { wrapper });
  await importPem(request);
  fireEvent.click(screen.getByRole("button", { name: "Apply requested subject" }));
  fireEvent.click(screen.getByRole("button", { name: "Apply requested SAN" }));
  fireEvent.change(screen.getByLabelText("Valid for (days)"), { target: { value: "60" } });
  fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
  expect(
    (screen.getByRole("checkbox", { name: "Include subject" }) as HTMLInputElement).checked,
  ).toBe(false);
  fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Signing policy" } });
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const saved = new CertificateTemplateStore(localStorage).list()[0];
  expect(saved.settings.subject).toBeUndefined();
  expect(saved.settings.san).toBeUndefined();
  expect(JSON.stringify(saved)).not.toContain("requested.example");
  fireEvent.change(screen.getByLabelText("Common name"), { target: { value: "current.example" } });
  fireEvent.change(screen.getByLabelText("Valid for (days)"), { target: { value: "15" } });
  expect(screen.getByRole("combobox", { name: "Template (modified)" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reapply template" }));
  const preview = await screen.findByRole("dialog", { name: "Apply Signing policy?" });
  expect(within(preview).getByText("current.example", { exact: false })).toBeTruthy();
  fireEvent.click(within(preview).getByRole("button", { name: "Cancel" }));
  expect((screen.getByLabelText("Valid for (days)") as HTMLInputElement).value).toBe("15");
  fireEvent.click(screen.getByRole("button", { name: "Reapply template" }));
  fireEvent.click(await screen.findByRole("button", { name: "Replace settings" }));
  expect((screen.getByLabelText("Common name") as HTMLInputElement).value).toBe("current.example");
  expect((screen.getByLabelText("Name 1") as HTMLInputElement).value).toBe("requested.example");
  expect((screen.getByLabelText("Valid for (days)") as HTMLInputElement).value).toBe("60");
  fireEvent.click(screen.getByRole("button", { name: "Save a copy" }));
  fireEvent.change(screen.getByLabelText("Template name"), {
    target: { value: "Identity policy" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Include subject" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Include subject alternative/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));
  await waitFor(() => expect(new CertificateTemplateStore(localStorage).list()).toHaveLength(2));
  expect(new CertificateTemplateStore(localStorage).list()[1].settings.subject).toContain(
    "current.example",
  );
  rendered.unmount();
  render(<CaIssueCertificateView />, { wrapper });
  await importPem(request);
  await selectOption(/Template/, "Signing policy");
  expect(await screen.findByRole("dialog", { name: "Apply Signing policy?" })).toBeTruthy();
});

test("failed template writes remain errors with the saved data intact and exact-date conversion is explicit", async () => {
  const { request, wrapper } = await fixture();
  const saved = new CertificateTemplateStore(localStorage).create(
    "Existing",
    createPresetConfiguration(),
  );
  const original = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  render(<CaIssueCertificateView />, { wrapper });
  await importPem(request);
  fireEvent.click(screen.getByRole("button", { name: "Use exact dates" }));
  fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
  fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "New" } });
  expect(
    (screen.getByRole("button", { name: "Save template" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /Convert exact dates/ }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Quota", "QuotaExceededError");
  });
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));
  await screen.findByText(/Templates were not saved/);
  expect(screen.getByRole("dialog", { name: "Save as template" })).toBeTruthy();
  expect(localStorage.getItem(TEMPLATE_STORAGE_KEY)).toBe(original);
  expect(new CertificateTemplateStore(localStorage).list()[0].id).toBe(saved.id);
  expect(screen.queryByText("Template saved in this browser.")).toBeNull();
});

test("template JSON file import validates collisions atomically and download contains portable settings only", async () => {
  const store = new CertificateTemplateStore(localStorage);
  store.create("Portable policy", createPresetConfiguration("code_signing"));
  const json = store.export();
  const original = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  const blobs = captureDownloads();
  render(
    <TemplateManager
      store={store}
      templates={store.list()}
      onChanged={vi.fn<() => void>()}
      onClose={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Upload template JSON"), {
    target: { files: [new File([json], "templates.json", { type: "application/json" })] },
  });
  await waitFor(() =>
    expect((screen.getByLabelText("Template JSON") as HTMLTextAreaElement).value).toBe(json),
  );
  fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));
  await screen.findByText(/already exists; choose replace/);
  expect(localStorage.getItem(TEMPLATE_STORAGE_KEY)).toBe(original);
  await selectOption("If a template ID already exists", "Import as a new copy");
  fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));
  await screen.findByText("Templates imported successfully.");
  expect(store.list()).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Template JSON"), {
    target: { value: '{"version":99,"templates":[]}' },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import JSON" }));
  await screen.findByText(/Unsupported template format version/);
  expect(store.list()).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Export all templates" }));
  const exported = JSON.parse(await blobText(blobs[0]));
  expect(exported.version).toBe(1);
  expect(exported.templates).toHaveLength(2);
  expect(Object.keys(exported.templates[0].settings).sort()).toEqual([
    "extendedKeyUsage",
    "keyUsage",
    "validity",
  ]);
});

test("theme initialization and changes work when localStorage access throws", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Storage denied");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage denied");
  });
  function ThemeControl() {
    const { darkMode, setDarkMode } = useApplicationContext();
    return <button onClick={() => setDarkMode(!darkMode)}>{darkMode ? "Dark" : "Light"}</button>;
  }
  render(
    <SnackbarProvider>
      <AppProvider>
        <ThemeControl />
      </AppProvider>
    </SnackbarProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Light" }));
  expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
  await screen.findByText(/Theme preference could not be saved/);
  expect(consoleError).not.toHaveBeenCalled();
});

test.each(["", "1e100"])(
  "invalid duration %s stays editable when switching to exact dates",
  async (duration) => {
    const { request, wrapper } = await fixture();
    render(<CaIssueCertificateView />, { wrapper });
    await importPem(request);
    fireEvent.change(screen.getByLabelText("Valid for (days)"), { target: { value: duration } });
    fireEvent.click(screen.getByRole("button", { name: "Use exact dates" }));
    expect(
      screen.getByText("Enter a valid positive duration before switching to exact dates."),
    ).toBeTruthy();
    expect((screen.getByLabelText("Valid for (days)") as HTMLInputElement).value).toBe(duration);
    expect(screen.queryByLabelText("Not before")).toBeNull();
  },
);

test.each(['Alice "Admin" Bob', "C:\\Users\\alice", "#Team"])(
  "structured subject keeps literal value %s through other field edits",
  async (commonName) => {
    const { request, wrapper } = await fixture();
    render(<CaIssueCertificateView />, { wrapper });
    await importPem(request);
    fireEvent.change(screen.getByLabelText("Common name"), { target: { value: commonName } });
    fireEvent.change(screen.getByLabelText("Organization"), {
      target: { value: 'New "Quoted" Organization' },
    });
    expect((screen.getByLabelText("Common name") as HTMLInputElement).value).toBe(commonName);
    fireEvent.click(screen.getByRole("button", { name: "Edit full DN" }));
    const subject = (screen.getByLabelText("Full subject distinguished name") as HTMLInputElement)
      .value;
    expect(new x509.Name(subject).getField("CN")).toEqual([commonName]);
    expect(new x509.Name(subject).getField("O")).toEqual(['New "Quoted" Organization']);
    fireEvent.click(screen.getByRole("button", { name: "Use structured fields" }));
    expect((screen.getByLabelText("Common name") as HTMLInputElement).value).toBe(commonName);
  },
);

test("relative and exact validity drafts survive review/back without stale template dates", async () => {
  const { request, wrapper } = await fixture();
  render(<CaIssueCertificateView />, { wrapper });
  await importPem(request);
  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  fireEvent.change(screen.getByLabelText("Valid for (days)"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Use exact dates" }));
  const exactEnd = (screen.getByLabelText("Not after") as HTMLInputElement).value;
  fireEvent.click(screen.getByRole("button", { name: "Review certificate" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("button", { name: "Advanced" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Use duration" }));
  expect((screen.getByLabelText("Valid for (days)") as HTMLInputElement).value).toBe("30");
  fireEvent.click(screen.getByRole("button", { name: "Use exact dates" }));
  expect((screen.getByLabelText("Not after") as HTMLInputElement).value).toBe(exactEnd);
  fireEvent.click(screen.getByRole("button", { name: "Use duration" }));
  await selectOption(/Template/, "Code signing");
  fireEvent.click(await screen.findByRole("button", { name: "Replace settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Use exact dates" }));
  expect((screen.getByLabelText("Not after") as HTMLInputElement).value).not.toBe(exactEnd);
});

test("a pending JSON file cannot import the previous draft or overwrite later typed JSON", async () => {
  const store = new CertificateTemplateStore(localStorage);
  store.create("Existing", createPresetConfiguration());
  const oldJson = store.export();
  let completeRead!: (value: ArrayBuffer) => void;
  vi.spyOn(fileHelpers, "readFile").mockReturnValue(
    new Promise((resolve) => {
      completeRead = resolve;
    }),
  );
  render(
    <TemplateManager
      store={store}
      templates={store.list()}
      onChanged={vi.fn<() => void>()}
      onClose={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Template JSON"), { target: { value: oldJson } });
  fireEvent.change(screen.getByLabelText("Upload template JSON"), {
    target: { files: [new File(["pending"], "next.json")] },
  });
  expect((screen.getByRole("button", { name: "Import JSON" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect((screen.getByLabelText("Template JSON") as HTMLTextAreaElement).value).toBe("");
  const typed = '{"version":1,"templates":[]}';
  fireEvent.change(screen.getByLabelText("Template JSON"), { target: { value: typed } });
  await act(async () => {
    completeRead(new TextEncoder().encode(oldJson).buffer);
  });
  expect((screen.getByLabelText("Template JSON") as HTMLTextAreaElement).value).toBe(typed);
  expect(store.list()).toHaveLength(1);
  expect(screen.queryByText("Templates imported successfully.")).toBeNull();
});

test("a raw DER DN attribute stays in the full editor without changing its ASN value", async () => {
  const { request, wrapper } = await fixture();
  render(<CaIssueCertificateView />, { wrapper });
  await importPem(request);
  fireEvent.click(screen.getByRole("button", { name: "Edit full DN" }));
  const rawDn = "CN=#0c03416263, O=Before";
  fireEvent.change(screen.getByLabelText("Full subject distinguished name"), {
    target: { value: rawDn },
  });
  fireEvent.click(screen.getByRole("button", { name: "Use structured fields" }));
  expect((screen.getByLabelText("Full subject distinguished name") as HTMLInputElement).value).toBe(
    rawDn,
  );
  expect(screen.queryByLabelText("Organization")).toBeNull();
  fireEvent.change(screen.getByLabelText("Full subject distinguished name"), {
    target: { value: "CN=#0c03416263, O=After" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review certificate" }));
  expect(screen.getByText("CN=#0c03416263, O=After")).toBeTruthy();
});

test("unavailable template storage reports its error without blocking certificate configuration", async () => {
  const { request, wrapper } = await fixture();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Storage denied");
  });
  render(<CaIssueCertificateView />, { wrapper });
  await importPem(request);
  expect(screen.getByText(/Cannot read local templates/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Review certificate" }));
  expect(
    (screen.getByRole("button", { name: "Issue certificate" }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

test.each([
  {
    label: "Country",
    complete: "UK",
    invalidMessage: /Country \(C\) must be a two-letter country code/,
  },
  {
    label: "Email",
    complete: "new@example.test",
    invalidMessage: /Subject email \(E\) must be a valid email address/,
  },
])(
  "$label stays editable character by character while review rejects incomplete values",
  async ({ label, complete, invalidMessage }) => {
    const { request, wrapper } = await fixture();
    render(<CaIssueCertificateView />, { wrapper });
    await importPem(request);
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText(label), { target: { value: complete[0] } });
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(complete[0]);
    expect(screen.queryByLabelText("Full subject distinguished name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review certificate" }));
    expect(screen.getByText(invalidMessage)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Issue certificate" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(complete[0]);
    for (let length = 2; length <= complete.length; length++) {
      const value = complete.slice(0, length);
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(value);
      expect(screen.queryByLabelText("Full subject distinguished name")).toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "Review certificate" }));
    expect(
      (screen.getByRole("button", { name: "Issue certificate" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  },
);
