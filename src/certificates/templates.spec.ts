import { beforeEach, describe, expect, test } from "vitest";
import { createPresetConfiguration } from "./presets";
import {
  CertificateTemplateStore,
  TEMPLATE_STORAGE_KEY,
  TemplateStorageError,
  applyTemplateSettings,
  createTemplateSettings,
  type TemplateDocument,
  type TemplateStorage,
} from "./templates";
import { convertToRelativeValidity } from "./validation";
import { TEST_NOW } from "./test-helpers";

class MemoryStorage implements TemplateStorage {
  value: string | null = null;
  writes = 0;
  readError = false;
  writeError = false;
  getItem(key: string): string | null {
    if (key !== TEMPLATE_STORAGE_KEY) throw new Error("Unexpected storage key");
    if (this.readError) throw new Error("Storage disabled");
    return this.value;
  }
  setItem(key: string, value: string): void {
    if (key !== TEMPLATE_STORAGE_KEY) throw new Error("Unexpected storage key");
    if (this.writeError) throw new DOMException("Quota exceeded", "QuotaExceededError");
    this.value = value;
    this.writes++;
  }
}

let storage: MemoryStorage;
let store: CertificateTemplateStore;
beforeEach(() => {
  storage = new MemoryStorage();
  let id = 0;
  store = new CertificateTemplateStore(storage, {
    now: () => TEST_NOW,
    createId: () => `template-${++id}`,
  });
});

test("CRUD, rename, and save-copy survive a new store instance", () => {
  const config = createPresetConfiguration("code_signing");
  const created = store.create("  Signing policy  ", config);
  expect(created).toMatchObject({
    kind: "x509",
    id: "template-1",
    name: "Signing policy",
    createdAt: TEST_NOW.toISOString(),
    updatedAt: TEST_NOW.toISOString(),
  });
  const updated = store.update(created.id, "New policy", createPresetConfiguration("pdf_signing"));
  expect(updated.id).toBe(created.id);
  expect(updated.createdAt).toBe(created.createdAt);
  expect(store.rename(created.id, "Renamed").name).toBe("Renamed");
  const duplicate = store.duplicate(created.id);
  expect(duplicate).toMatchObject({ id: "template-2", name: "Renamed (copy)" });
  expect(duplicate.settings).toEqual(updated.settings);
  expect(store.duplicate(created.id).name).toBe("Renamed (copy 2)");
  const reloaded = new CertificateTemplateStore(storage);
  expect(reloaded.list()).toHaveLength(3);
  reloaded.delete(created.id);
  expect(reloaded.list().map((template) => template.id)).toEqual(["template-2", "template-3"]);
  expect(() => reloaded.delete(created.id)).toThrow(TemplateStorageError);
});

test("omits subject and SAN by default and never stores per-issuance data", () => {
  const config = createPresetConfiguration("smime", { email: "user@example.com" });
  const template = store.create("S/MIME", config);
  expect(template.settings).not.toHaveProperty("subject");
  expect(template.settings).not.toHaveProperty("san");
  expect(JSON.parse(store.export())).toEqual({ version: 1, templates: [template] });
  expect(storage.value).not.toMatch(
    /subject|san|publicKey|privateKey|issuer|serial|certificate|notBefore|notAfter/,
  );
  const withIdentity = store.create("Personal S/MIME", config, {
    includeSubject: true,
    includeSan: true,
  });
  expect(withIdentity.settings.subject).toBe(config.subject);
  expect(withIdentity.settings.san).toEqual(config.san);
});

test("applying and editing a template preserves omitted current identity and cannot mutate stored settings", () => {
  const template = store.create("Code signing", createPresetConfiguration("code_signing"));
  const current = createPresetConfiguration("smime", {
    subject: "CN=Current signer",
    email: "current@example.com",
    validityDays: 10,
  });
  const applied = applyTemplateSettings(current, template.settings);
  expect(applied.subject).toBe(current.subject);
  expect(applied.san).toEqual(current.san);
  expect(applied.extendedKeyUsage.oids).toEqual(["1.3.6.1.5.5.7.3.3"]);
  applied.san.entries[0].value = "changed@example.com";
  applied.keyUsage.usages.length = 0;
  template.settings.extendedKeyUsage.oids.push("1.2.3.4");
  expect(current.san.entries[0].value).toBe("current@example.com");
  expect(store.list()[0].settings.extendedKeyUsage.oids).toEqual(["1.3.6.1.5.5.7.3.3"]);
  expect(store.list()[0].settings.keyUsage.usages).toEqual(["digitalSignature"]);
});

test("requires explicit exact-date conversion and stores a duration only", () => {
  const configuration = createPresetConfiguration();
  configuration.validity = {
    mode: "exact",
    notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2026-01-31T00:00:00.000Z",
  };
  expect(() => createTemplateSettings(configuration)).toThrow("explicitly convert");
  expect(
    store.create("Relative policy", convertToRelativeValidity(configuration)).settings.validity,
  ).toEqual({ mode: "relative", days: 30 });
  expect(storage.value).not.toMatch(/notBefore|notAfter/);
});

test("exports selected templates and imports them in one write", () => {
  const first = store.create("First", createPresetConfiguration());
  store.create("Second", createPresetConfiguration("code_signing"));
  const exportJson = store.export([first.id]);
  const target = new MemoryStorage();
  const imported = new CertificateTemplateStore(target).import(exportJson);
  expect(imported).toEqual([first]);
  expect(target.writes).toBe(1);
  expect(new CertificateTemplateStore(target).list()).toEqual([first]);
});

test("handles import id collisions explicitly with reject, replace, or copy", () => {
  const first = store.create("Original", createPresetConfiguration());
  const document: TemplateDocument = { version: 1, templates: [{ ...first, name: "Imported" }] };
  const before = storage.value;
  expect(() => store.import(JSON.stringify(document))).toThrow("already exists");
  expect(storage.value).toBe(before);
  expect(store.import(JSON.stringify(document), "replace")[0]).toMatchObject({
    id: first.id,
    name: "Imported",
  });
  expect(store.list()).toHaveLength(1);
  const copied = store.import(JSON.stringify(document), "copy");
  expect(copied[0]).toMatchObject({ id: "template-2", name: "Imported (copy)" });
  expect(store.list()).toHaveLength(2);
});

test("invalid batches never partially import, including forbidden metadata and future versions", () => {
  const template = store.create("Existing", createPresetConfiguration());
  const before = storage.value;
  const writes = storage.writes;
  for (const document of [
    { version: 2, templates: [template] },
    {
      version: 1,
      templates: [
        { ...template, id: "valid-new" },
        {
          ...template,
          id: "invalid-new",
          settings: { ...template.settings, privateKey: "secret" },
        },
      ],
    },
    {
      version: 1,
      templates: [
        { ...template, id: "valid-new" },
        {
          ...template,
          id: "invalid-new",
          settings: { ...template.settings, extendedKeyUsage: { oids: ["9.9"], critical: false } },
        },
      ],
    },
    {
      version: 1,
      templates: [
        { ...template, id: "duplicate" },
        { ...template, id: "duplicate" },
      ],
    },
    { version: 1, templates: [{ ...template, kind: "ssh" }] },
    { version: 1, templates: [{ ...template, cert: "certificate" }] },
  ]) {
    expect(() => store.import(JSON.stringify(document))).toThrow(TemplateStorageError);
    expect(storage.value).toBe(before);
    expect(storage.writes).toBe(writes);
  }
  expect(() => store.import("{broken json")).toThrow(TemplateStorageError);
  expect(storage.value).toBe(before);
});

describe("storage failures", () => {
  test.each(["not json", '{"version":99,"templates":[]}', '{"version":1,"templates":[{}]}'])(
    "preserves malformed or future stored data %s",
    (value) => {
      storage.value = value;
      expect(() => store.list()).toThrow(TemplateStorageError);
      expect(() => store.create("New", createPresetConfiguration())).toThrow(TemplateStorageError);
      expect(storage.value).toBe(value);
      expect(storage.writes).toBe(0);
    },
  );
  test("read failures surface without writing", () => {
    storage.readError = true;
    expect(() => store.create("New", createPresetConfiguration())).toThrow(
      expect.objectContaining({ code: "read" }),
    );
    expect(storage.writes).toBe(0);
  });
  test("quota/write failures never report an unsaved change as saved", () => {
    const original = store.create("Original", createPresetConfiguration());
    const before = storage.value;
    storage.writeError = true;
    for (const action of [
      () => store.create("Unsaved", createPresetConfiguration()),
      () => store.rename(original.id, "Unsaved"),
      () => store.update(original.id, "Unsaved", createPresetConfiguration("pdf_signing")),
      () => store.duplicate(original.id),
      () => store.delete(original.id),
      () => store.import(store.export(), "copy"),
    ]) {
      expect(action).toThrow(expect.objectContaining({ code: "write" }));
      expect(storage.value).toBe(before);
      expect(store.list()).toEqual([original]);
    }
  });
});
