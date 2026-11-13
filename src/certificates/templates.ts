import {
  CertificateValidationError,
  cloneConfiguration,
  type ExtendedKeyUsageConfiguration,
  type KeyUsageConfiguration,
  type RelativeValidity,
  type SanConfiguration,
  type X509Configuration,
} from "./types";
import { hasControlCharacters, isRecord, parseX509Configuration } from "./validation";

export const TEMPLATE_STORAGE_KEY = "goodkey-demo-ca.templates.v1";
export const TEMPLATE_FORMAT_VERSION = 1;

export interface X509TemplateSettings {
  validity: RelativeValidity;
  keyUsage: KeyUsageConfiguration;
  extendedKeyUsage: ExtendedKeyUsageConfiguration;
  subject?: string;
  san?: SanConfiguration;
}

export interface X509Template {
  id: string;
  kind: "x509";
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: X509TemplateSettings;
}

export interface TemplateDocument {
  version: 1;
  templates: X509Template[];
}

export interface TemplateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface TemplateSaveOptions {
  includeSubject?: boolean;
  includeSan?: boolean;
}

export type TemplateErrorCode =
  | "read"
  | "write"
  | "invalid"
  | "version"
  | "collision"
  | "not-found";

export class TemplateStorageError extends Error {
  constructor(
    public readonly code: TemplateErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TemplateStorageError";
  }
}

function invalid(message: string): never {
  throw new TemplateStorageError("invalid", message);
}

function requireKeys(
  value: unknown,
  allowed: string[],
  description: string,
): Record<string, unknown> {
  if (!isRecord(value)) return invalid(`${description} must be an object.`);
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    return invalid(
      `${description} contains unsupported settings. Keys, certificate inputs, issuer data, and generated certificate fields cannot be stored in templates.`,
    );
  return value;
}

function validName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.trim() === name &&
    name.length > 0 &&
    name.length <= 100 &&
    !hasControlCharacters(name)
  );
}

function validId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z\d][a-z\d_-]{0,127}$/i.test(id);
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(new Date(value).getTime()) &&
    new Date(value).toISOString() === value
  );
}

function cloneSettings(settings: X509TemplateSettings): X509TemplateSettings {
  return {
    validity: { ...settings.validity },
    keyUsage: { usages: [...settings.keyUsage.usages], critical: settings.keyUsage.critical },
    extendedKeyUsage: {
      oids: [...settings.extendedKeyUsage.oids],
      critical: settings.extendedKeyUsage.critical,
    },
    ...(settings.subject !== undefined ? { subject: settings.subject } : {}),
    ...(settings.san !== undefined
      ? {
          san: {
            entries: settings.san.entries.map((entry) => ({ ...entry })),
            critical: settings.san.critical,
          },
        }
      : {}),
  };
}

function cloneTemplate(template: X509Template): X509Template {
  return { ...template, settings: cloneSettings(template.settings) };
}

export function parseTemplateSettings(value: unknown): X509TemplateSettings {
  const settings = requireKeys(
    value,
    ["validity", "keyUsage", "extendedKeyUsage", "subject", "san"],
    "Template settings",
  );
  if (settings.subject !== undefined && typeof settings.subject !== "string")
    invalid("Template subject must be text.");
  try {
    const configuration = parseX509Configuration(
      {
        ...settings,
        subject: settings.subject ?? "",
        san: settings.san ?? { entries: [], critical: false },
      },
      { allowMissingIdentity: true },
    );
    if (configuration.validity.mode !== "relative")
      invalid("Templates store a relative duration; explicitly convert exact dates before saving.");
    return {
      validity: { ...configuration.validity },
      keyUsage: configuration.keyUsage,
      extendedKeyUsage: configuration.extendedKeyUsage,
      ...(settings.subject !== undefined ? { subject: configuration.subject } : {}),
      ...(settings.san !== undefined ? { san: configuration.san } : {}),
    };
  } catch (error) {
    if (error instanceof TemplateStorageError) throw error;
    throw new TemplateStorageError(
      "invalid",
      error instanceof Error ? error.message : "Invalid template settings.",
      { cause: error },
    );
  }
}

export function createTemplateSettings(
  configuration: X509Configuration,
  options: TemplateSaveOptions = {},
): X509TemplateSettings {
  if (configuration.validity.mode !== "relative") {
    throw new CertificateValidationError([
      {
        field: "validity",
        code: "template-relative-required",
        message:
          "Templates store relative validity days; explicitly convert exact dates to a duration before saving.",
      },
    ]);
  }
  return parseTemplateSettings({
    validity: configuration.validity,
    keyUsage: configuration.keyUsage,
    extendedKeyUsage: configuration.extendedKeyUsage,
    ...(options.includeSubject ? { subject: configuration.subject } : {}),
    ...(options.includeSan ? { san: configuration.san } : {}),
  });
}

export function applyTemplateSettings(
  current: X509Configuration,
  settings: X509TemplateSettings,
): X509Configuration {
  const valid = parseTemplateSettings(settings);
  const copy = cloneConfiguration(current);
  return {
    subject: valid.subject ?? copy.subject,
    validity: { ...valid.validity },
    san: valid.san ?? copy.san,
    keyUsage: valid.keyUsage,
    extendedKeyUsage: valid.extendedKeyUsage,
  };
}

export function parseTemplateDocument(value: unknown): TemplateDocument {
  const document = requireKeys(value, ["version", "templates"], "Template file");
  if (document.version !== TEMPLATE_FORMAT_VERSION)
    throw new TemplateStorageError(
      "version",
      `Unsupported template format version: ${String(document.version)}. Only version 1 is supported.`,
    );
  if (!Array.isArray(document.templates)) invalid("Template file must contain a templates array.");
  const ids = new Set<string>();
  const templates = document.templates.map((item: unknown): X509Template => {
    const template = requireKeys(
      item,
      ["id", "kind", "name", "createdAt", "updatedAt", "settings"],
      "Template",
    );
    if (!validId(template.id))
      return invalid("Template id must be 1–128 letters, digits, underscores, or hyphens.");
    if (ids.has(template.id)) return invalid(`Template file contains duplicate id ${template.id}.`);
    ids.add(template.id);
    if (template.kind !== "x509") return invalid("Only X.509 templates are supported.");
    if (!validName(template.name))
      return invalid(
        "Template names must contain 1–100 characters without surrounding whitespace or control characters.",
      );
    if (
      !validTimestamp(template.createdAt) ||
      !validTimestamp(template.updatedAt) ||
      template.updatedAt < template.createdAt
    )
      return invalid("Template timestamps must be ISO dates with updatedAt at or after createdAt.");
    return {
      id: template.id,
      kind: "x509",
      name: template.name,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      settings: parseTemplateSettings(template.settings),
    };
  });
  return { version: TEMPLATE_FORMAT_VERSION, templates };
}

function parseJson(text: string): TemplateDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new TemplateStorageError(
      "invalid",
      "Template data is not valid JSON; existing data has been preserved.",
      { cause: error },
    );
  }
  return parseTemplateDocument(value);
}

export class CertificateTemplateStore {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly storage: TemplateStorage,
    options: { now?: () => Date; createId?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  list(): X509Template[] {
    let raw: string | null;
    try {
      raw = this.storage.getItem(TEMPLATE_STORAGE_KEY);
    } catch (error) {
      throw new TemplateStorageError(
        "read",
        "Cannot read local templates; browser storage may be unavailable.",
        { cause: error },
      );
    }
    return raw === null ? [] : parseJson(raw).templates;
  }

  private write(templates: X509Template[]): void {
    const document = parseTemplateDocument({ version: TEMPLATE_FORMAT_VERSION, templates });
    try {
      this.storage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(document));
    } catch (error) {
      throw new TemplateStorageError(
        "write",
        "Templates were not saved. Browser storage may be full or unavailable; existing data has been preserved.",
        { cause: error },
      );
    }
  }

  private newId(templates: X509Template[]): string {
    const id = this.createId();
    if (!validId(id) || templates.some((template) => template.id === id))
      throw new TemplateStorageError(
        "collision",
        "Cannot allocate a unique template id; try again.",
      );
    return id;
  }

  create(
    name: string,
    configuration: X509Configuration,
    options: TemplateSaveOptions = {},
  ): X509Template {
    const templates = this.list();
    const timestamp = this.now().toISOString();
    const template: X509Template = {
      id: this.newId(templates),
      kind: "x509",
      name: name.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      settings: createTemplateSettings(configuration, options),
    };
    this.write([...templates, template]);
    return cloneTemplate(template);
  }

  update(
    id: string,
    name: string,
    configuration: X509Configuration,
    options: TemplateSaveOptions = {},
  ): X509Template {
    const templates = this.list();
    const existing = templates.find((template) => template.id === id);
    if (!existing) throw new TemplateStorageError("not-found", "The template no longer exists.");
    const updated = {
      ...existing,
      name: name.trim(),
      updatedAt: this.now().toISOString(),
      settings: createTemplateSettings(configuration, options),
    };
    this.write(templates.map((template) => (template.id === id ? updated : template)));
    return cloneTemplate(updated);
  }

  rename(id: string, name: string): X509Template {
    const templates = this.list();
    const existing = templates.find((template) => template.id === id);
    if (!existing) throw new TemplateStorageError("not-found", "The template no longer exists.");
    const updated = { ...existing, name: name.trim(), updatedAt: this.now().toISOString() };
    this.write(templates.map((template) => (template.id === id ? updated : template)));
    return cloneTemplate(updated);
  }

  duplicate(id: string, name?: string): X509Template {
    const templates = this.list();
    const existing = templates.find((template) => template.id === id);
    if (!existing) throw new TemplateStorageError("not-found", "The template no longer exists.");
    const timestamp = this.now().toISOString();
    const copy: X509Template = {
      ...cloneTemplate(existing),
      id: this.newId(templates),
      name: name?.trim() ?? this.copyName(existing.name, templates),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.write([...templates, copy]);
    return cloneTemplate(copy);
  }

  private copyName(name: string, templates: X509Template[]): string {
    let suffix = " (copy)";
    let index = 2;
    while (
      templates.some((template) => template.name === name.slice(0, 100 - suffix.length) + suffix)
    )
      suffix = ` (copy ${index++})`;
    return name.slice(0, 100 - suffix.length) + suffix;
  }

  delete(id: string): void {
    const templates = this.list();
    if (!templates.some((template) => template.id === id))
      throw new TemplateStorageError("not-found", "The template no longer exists.");
    this.write(templates.filter((template) => template.id !== id));
  }

  export(ids?: string[]): string {
    const templates = this.list();
    if (ids?.some((id) => !templates.some((template) => template.id === id)))
      throw new TemplateStorageError("not-found", "An exported template no longer exists.");
    return JSON.stringify(
      {
        version: TEMPLATE_FORMAT_VERSION,
        templates: ids ? templates.filter((template) => ids.includes(template.id)) : templates,
      },
      null,
      2,
    );
  }

  import(text: string, collision: "reject" | "replace" | "copy" = "reject"): X509Template[] {
    const incoming = parseJson(text).templates;
    const templates = this.list();
    const imported: X509Template[] = [];
    for (const item of incoming) {
      const index = templates.findIndex((template) => template.id === item.id);
      let template = item;
      if (index !== -1) {
        if (collision === "reject")
          throw new TemplateStorageError(
            "collision",
            `Template ${item.name} already exists; choose replace or import as a copy.`,
          );
        if (collision === "copy") {
          const timestamp = this.now().toISOString();
          template = {
            ...cloneTemplate(item),
            id: this.newId([...templates, ...incoming]),
            name: this.copyName(item.name, templates),
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          templates.push(template);
        } else templates[index] = template;
      } else templates.push(template);
      imported.push(template);
    }
    this.write(templates);
    return imported.map(cloneTemplate);
  }
}

export function createBrowserTemplateStore(): CertificateTemplateStore {
  try {
    return new CertificateTemplateStore(window.localStorage);
  } catch (error) {
    throw new TemplateStorageError(
      "read",
      "Local templates are unavailable because browser storage is disabled.",
      { cause: error },
    );
  }
}
