import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  ListSubheader,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import { X509Certificate } from "@peculiar/x509";
import * as React from "react";
import { useCaContext } from "./CaProvider";
import { useApplicationContext } from "./AppProvider";
import { CertificateDetails } from "./CertificateDetails";
import {
  applyTemplateSettings,
  BUILT_IN_PRESETS,
  CertificateValidationError,
  cloneConfiguration,
  createBrowserTemplateStore,
  createPresetConfiguration,
  parseCertificateInput,
  resolveCertificateConfiguration,
  TEMPLATE_STORAGE_KEY,
  validateX509Configuration,
  type CertificatePresetId,
  type CertificateTemplateStore,
  type ExactValidity,
  type ParsedCertificateInput,
  type ResolvedX509Configuration,
  type TemplateSaveOptions,
  type ValidationIssue,
  type X509Configuration,
  type X509Template,
} from "./certificates";
import { CertificateInput } from "./certificate-ui/CertificateInput";
import { CertificateConfigurationEditor } from "./certificate-ui/CertificateConfigurationEditor";
import { CertificateSummary } from "./certificate-ui/CertificateSummary";
import { SaveTemplateDialog } from "./certificate-ui/SaveTemplateDialog";
import { TemplateManager } from "./certificate-ui/TemplateManager";
import { downloadFile, errorMessage, readFile } from "./certificate-ui/files";

interface TemplateSelection {
  id: string;
  baseline: string;
}
interface PendingTemplate {
  id: string;
  name: string;
  configuration: X509Configuration;
}

function changedSections(current: X509Configuration, next: X509Configuration): string[] {
  return (
    [
      ["subject", "Subject"],
      ["validity", "Validity"],
      ["san", "Subject alternative names"],
      ["keyUsage", "Key usage"],
      ["extendedKeyUsage", "Extended key usage"],
    ] as const
  )
    .filter(([field]) => JSON.stringify(current[field]) !== JSON.stringify(next[field]))
    .map(([, label]) => label);
}

export function CaIssueCertificateView() {
  const { enrollCertificate, value: ca } = useCaContext();
  const { setInfo, setError } = useApplicationContext();
  const [activeStep, setActiveStep] = React.useState(0);
  const [text, setText] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [input, setInput] = React.useState<ParsedCertificateInput>();
  const [importPending, setImportPending] = React.useState(false);
  const [importError, setImportError] = React.useState("");
  const importVersion = React.useRef(0);
  const [configuration, setConfiguration] = React.useState<X509Configuration>(() =>
    createPresetConfiguration(),
  );
  const [selection, setSelection] = React.useState<TemplateSelection>(() => ({
    id: "builtin:none",
    baseline: JSON.stringify(createPresetConfiguration()),
  }));
  const [editorPreferences, setEditorPreferences] = React.useState({
    advanced: false,
    fullDn: false,
  });
  const validityDrafts = React.useRef<{ relative: number; exact?: ExactValidity }>({
    relative: 365,
  });
  const [templates, setTemplates] = React.useState<X509Template[]>([]);
  const [store, setStore] = React.useState<CertificateTemplateStore>();
  const [storageError, setStorageError] = React.useState("");
  const [pendingTemplate, setPendingTemplate] = React.useState<PendingTemplate>();
  const [managing, setManaging] = React.useState(false);
  const [saving, setSaving] = React.useState<"copy" | "update">();
  const [resolved, setResolved] = React.useState<ResolvedX509Configuration>();
  const [reviewIssues, setReviewIssues] = React.useState<ValidationIssue[]>([]);
  const [certificate, setCertificate] = React.useState<X509Certificate>();
  const [issuing, setIssuing] = React.useState(false);
  const issueLock = React.useRef(false);
  const [issueError, setIssueError] = React.useState("");
  const caCertificate = React.useMemo(
    () => (ca ? new X509Certificate(ca.cert) : undefined),
    [ca?.cert],
  );
  const selectedTemplate = templates.find((template) => `local:${template.id}` === selection.id);
  const modified = JSON.stringify(configuration) !== selection.baseline;

  const refreshTemplates = React.useCallback(
    (storage = store) => {
      try {
        if (!storage)
          throw new Error("Local templates are unavailable because browser storage is disabled.");
        setTemplates(storage.list());
        setStorageError("");
      } catch (error) {
        setStorageError(errorMessage(error));
      }
    },
    [store],
  );
  React.useEffect(() => {
    try {
      const storage = createBrowserTemplateStore();
      setStore(storage);
      setTemplates(storage.list());
    } catch (error) {
      setStorageError(errorMessage(error));
    }
  }, []);
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEMPLATE_STORAGE_KEY || event.key === null) refreshTemplates();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshTemplates]);
  React.useEffect(
    () => () => {
      importVersion.current++;
    },
    [],
  );

  const beginImport = () => {
    const version = ++importVersion.current;
    setInput(undefined);
    setImportError("");
    setImportPending(true);
    setResolved(undefined);
    setCertificate(undefined);
    return version;
  };
  const parseInput = async (raw: string | ArrayBuffer, version: number) => {
    try {
      const parsed = await parseCertificateInput(raw);
      if (version === importVersion.current) setInput(parsed);
    } catch (error) {
      if (version === importVersion.current) setImportError(errorMessage(error));
    } finally {
      if (version === importVersion.current) setImportPending(false);
    }
  };
  const onText = (value: string) => {
    setText(value);
    setFileName("");
    const version = beginImport();
    if (!value.trim()) {
      setImportPending(false);
      return;
    }
    void parseInput(value, version);
  };
  const onFile = async (file: File) => {
    const version = beginImport();
    setFileName(file.name);
    setText("");
    try {
      if (file.size > 1_048_576) throw new Error("Certificate input must not exceed 1 MiB.");
      const data = await readFile(file);
      if (version !== importVersion.current) return;
      const contents = new TextDecoder().decode(data);
      if (contents.trim().startsWith("-----BEGIN")) setText(contents);
      await parseInput(data, version);
    } catch (error) {
      if (version === importVersion.current) {
        setImportError(errorMessage(error));
        setImportPending(false);
      }
    }
  };
  const apply = (pending: PendingTemplate) => {
    validityDrafts.current = {
      relative:
        pending.configuration.validity.mode === "relative"
          ? pending.configuration.validity.days
          : validityDrafts.current.relative,
    };
    setConfiguration(cloneConfiguration(pending.configuration));
    setSelection({ id: pending.id, baseline: JSON.stringify(pending.configuration) });
    setPendingTemplate(undefined);
  };
  const chooseTemplate = (id: string) => {
    try {
      let next: X509Configuration;
      let name: string;
      if (id.startsWith("builtin:")) {
        const presetId = id.slice(8) as CertificatePresetId;
        next = createPresetConfiguration(presetId, {
          subject: configuration.subject,
          keyAlgorithm: input?.metadata.algorithm,
        });
        if (presetId !== "smime") next.san = cloneConfiguration(configuration).san;
        name = BUILT_IN_PRESETS.find((preset) => preset.id === presetId)?.name ?? "Custom";
      } else {
        const template = templates.find((item) => `local:${item.id}` === id);
        if (!template) throw new Error("This template is no longer available.");
        next = applyTemplateSettings(configuration, template.settings);
        name = template.name;
      }
      const pending = { id, name, configuration: next };
      if (changedSections(configuration, next).length) setPendingTemplate(pending);
      else apply(pending);
    } catch (error) {
      setStorageError(errorMessage(error));
    }
  };
  const saveTemplate = (name: string, config: X509Configuration, options: TemplateSaveOptions) => {
    if (!store)
      throw new Error("Local templates are unavailable because browser storage is disabled.");
    const template =
      saving === "update" && selectedTemplate
        ? store.update(selectedTemplate.id, name, config, options)
        : store.create(name, config, options);
    refreshTemplates(store);
    setSelection({ id: `local:${template.id}`, baseline: JSON.stringify(configuration) });
    setSaving(undefined);
    setInfo("Template saved in this browser.");
  };
  const review = () => {
    setIssueError("");
    setResolved(undefined);
    if (!input || !caCertificate) return;
    try {
      setResolved(
        resolveCertificateConfiguration(configuration, {
          caCertificate,
          publicKey: input.publicKey,
        }),
      );
      setReviewIssues([]);
    } catch (error) {
      setReviewIssues(
        error instanceof CertificateValidationError
          ? error.issues
          : [{ field: "configuration", code: "invalid", message: errorMessage(error) }],
      );
    }
    setActiveStep(2);
  };
  const issue = async () => {
    if (issueLock.current || !input || !resolved) return;
    issueLock.current = true;
    setIssuing(true);
    setIssueError("");
    try {
      const { notBefore, notAfter, ...settings } = resolved;
      const cert = await enrollCertificate(input.publicKey, {
        ...settings,
        validity: { mode: "exact", notBefore, notAfter },
      });
      setCertificate(cert);
      setActiveStep(3);
    } catch (error) {
      setIssueError(errorMessage(error));
    } finally {
      issueLock.current = false;
      setIssuing(false);
    }
  };
  const copyCertificate = async () => {
    try {
      if (certificate) {
        await navigator.clipboard.writeText(certificate.toString("pem"));
        setInfo("Certificate PEM copied.");
      }
    } catch (error) {
      setError(new Error(errorMessage(error)));
    }
  };
  const downloadCertificate = () => {
    try {
      if (certificate)
        downloadFile(
          certificate.toString("pem"),
          `${certificate.serialNumber}.pem`,
          "application/x-x509-ca-cert",
        );
    } catch (error) {
      setError(new Error(errorMessage(error)));
    }
  };
  const another = () => {
    importVersion.current++;
    setInput(undefined);
    setText("");
    setFileName("");
    setImportError("");
    setImportPending(false);
    setCertificate(undefined);
    setResolved(undefined);
    setIssueError("");
    setActiveStep(0);
  };
  const pickerValue =
    selection.id.startsWith("local:") && !selectedTemplate ? "builtin:none" : selection.id;
  const liveIssues =
    input && caCertificate
      ? validateX509Configuration(configuration, { caCertificate, publicKey: input.publicKey })
      : [];
  const summary = (
    <CertificateSummary
      configuration={configuration}
      issuer={caCertificate?.subject ?? "Unavailable"}
      publicKey={input?.metadata.label ?? "No key imported"}
      issues={activeStep === 2 ? reviewIssues : liveIssues}
      resolved={activeStep === 2 ? resolved : undefined}
    />
  );

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
        Issue certificate
      </Typography>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ my: 3 }}>
        {["Import key", "Configure", "Review", "Done"].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {activeStep === 0 && (
        <CertificateInput
          text={text}
          fileName={fileName}
          parsed={input}
          pending={importPending}
          error={importError}
          onText={onText}
          onFile={(file) => void onFile(file)}
        />
      )}
      {activeStep === 1 && input && (
        <>
          <Stack
            direction="row"
            useFlexGap
            sx={{ flexWrap: "wrap", gap: 1, alignItems: "center", mb: 2 }}
          >
            <Chip
              size="small"
              label={`${input.type.toUpperCase()} imported · ${input.metadata.label}`}
            />
            {input.requested && (
              <Typography variant="body2" color="text.secondary">
                Requested identity and extensions available
              </Typography>
            )}
          </Stack>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ alignItems: { sm: "center" }, mb: 2 }}
          >
            <TextField
              select
              label={`Template${modified ? " (modified)" : ""}`}
              value={pickerValue}
              onChange={(event) => chooseTemplate(event.target.value)}
              size="small"
              sx={{ flex: 1 }}
            >
              <ListSubheader>Built-in presets</ListSubheader>
              {BUILT_IN_PRESETS.map((preset) => (
                <MenuItem key={preset.id} value={`builtin:${preset.id}`}>
                  {preset.name}
                </MenuItem>
              ))}
              {templates.length > 0 && <ListSubheader>My templates</ListSubheader>}
              {templates.map((template) => (
                <MenuItem key={template.id} value={`local:${template.id}`}>
                  {template.name}
                </MenuItem>
              ))}
            </TextField>
            <Chip
              size="small"
              variant="outlined"
              label={
                selectedTemplate
                  ? "My template"
                  : pickerValue === "builtin:none"
                    ? "Custom"
                    : "Built-in"
              }
            />
            <Button onClick={() => setManaging(true)}>Manage templates</Button>
            {modified && (
              <Button onClick={() => chooseTemplate(pickerValue)}>Reapply template</Button>
            )}
          </Stack>
          {storageError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {storageError}
            </Alert>
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                lg: "minmax(0, 1.75fr) minmax(300px, 1fr)",
              },
              gap: 3,
            }}
          >
            <CertificateConfigurationEditor
              configuration={configuration}
              onChange={setConfiguration}
              input={input}
              preferences={editorPreferences}
              onPreferences={setEditorPreferences}
              validityDrafts={validityDrafts}
              issues={liveIssues}
            />
            <Box
              sx={{
                borderLeft: { lg: 1 },
                borderColor: { lg: "divider" },
                pl: { lg: 3 },
                minWidth: 0,
              }}
            >
              {summary}
            </Box>
          </Box>
        </>
      )}
      {activeStep === 2 && (
        <Stack spacing={2}>
          <Alert severity={reviewIssues.length ? "warning" : "info"}>
            {reviewIssues.length
              ? "Go back to edit the configuration, then review it again."
              : "Confirm the effective settings below. Issuance uses these exact validity dates."}
          </Alert>
          {summary}
          {issueError && <Alert severity="error">{issueError}</Alert>}
        </Stack>
      )}
      {activeStep === 3 && certificate && (
        <Stack spacing={2}>
          <Alert severity="success">Certificate issued successfully.</Alert>
          <CertificateDetails certificate={certificate} />
          <TextField
            label="Issued certificate (PEM)"
            multiline
            minRows={6}
            maxRows={12}
            fullWidth
            value={certificate.toString("pem")}
            slotProps={{ input: { readOnly: true, sx: { fontFamily: "monospace", fontSize: 12 } } }}
          />
          <Stack direction="row" spacing={1}>
            <Button onClick={() => void copyCertificate()}>Copy PEM</Button>
            <Button onClick={downloadCertificate}>Download PEM</Button>
          </Stack>
        </Stack>
      )}
      <Divider sx={{ mt: 3, mb: 2 }} />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ justifyContent: "flex-end", alignItems: { sm: "center" } }}
      >
        {activeStep > 0 && activeStep < 3 && (
          <Button disabled={issuing} onClick={() => setActiveStep(activeStep - 1)}>
            Back
          </Button>
        )}
        {activeStep > 0 && <Box sx={{ flex: 1 }} />}
        {activeStep > 0 && (
          <Stack spacing={0.25} sx={{ alignItems: { sm: "center" } }}>
            <Stack direction="row" spacing={1}>
              {selectedTemplate && (
                <Button disabled={issuing} onClick={() => setSaving("update")}>
                  Save changes
                </Button>
              )}
              <Button disabled={issuing} onClick={() => setSaving("copy")}>
                {selectedTemplate || selection.id !== "builtin:none"
                  ? "Save a copy"
                  : "Save as template"}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Templates stay in this browser.
            </Typography>
          </Stack>
        )}
        {activeStep === 0 && (
          <Button
            variant="contained"
            disabled={!input || importPending}
            onClick={() => setActiveStep(1)}
          >
            Configure certificate
          </Button>
        )}
        {activeStep === 1 && (
          <Button variant="contained" onClick={review}>
            Review certificate
          </Button>
        )}
        {activeStep === 2 && (
          <Button
            variant="contained"
            disabled={issuing || !resolved || reviewIssues.length > 0}
            onClick={() => void issue()}
          >
            {issuing ? "Issuing…" : "Issue certificate"}
          </Button>
        )}
        {activeStep === 3 && (
          <Button variant="contained" onClick={another}>
            Issue another
          </Button>
        )}
      </Stack>
      {saving && (
        <SaveTemplateDialog
          configuration={configuration}
          existing={saving === "update" ? selectedTemplate : undefined}
          onClose={() => setSaving(undefined)}
          onSave={saveTemplate}
        />
      )}
      {managing && (
        <TemplateManager
          store={store}
          templates={templates}
          onChanged={refreshTemplates}
          onClose={() => setManaging(false)}
        />
      )}
      {pendingTemplate && (
        <Dialog
          open
          onClose={() => setPendingTemplate(undefined)}
          fullWidth
          maxWidth="sm"
          aria-labelledby="apply-template-title"
        >
          <DialogTitle id="apply-template-title">Apply {pendingTemplate.name}?</DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>
              This replaces the following current settings:{" "}
              {changedSections(configuration, pendingTemplate.configuration).join(", ")}. Fields
              omitted by a saved template are preserved.
            </Typography>
            <CertificateSummary
              configuration={pendingTemplate.configuration}
              issuer={caCertificate?.subject ?? ""}
              publicKey={input?.metadata.label ?? ""}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPendingTemplate(undefined)}>Cancel</Button>
            <Button variant="contained" onClick={() => apply(pendingTemplate)}>
              Replace settings
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
