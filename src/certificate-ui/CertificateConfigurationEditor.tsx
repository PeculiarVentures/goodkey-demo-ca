import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Add, Close, ExpandMore } from "@mui/icons-material";
import { Name, type JsonNameParams } from "@peculiar/x509";
import * as React from "react";
import {
  EXTENDED_KEY_USAGE_LABELS,
  KEY_USAGE_LABELS,
  validateSubject,
  type ExactValidity,
  type KeyUsage,
  type ParsedCertificateInput,
  type SubjectAlternativeName,
  type ValidationIssue,
  type X509Configuration,
} from "../certificates";

interface Props {
  configuration: X509Configuration;
  onChange(configuration: X509Configuration): void;
  input: ParsedCertificateInput;
  preferences: { advanced: boolean; fullDn: boolean };
  onPreferences(value: { advanced: boolean; fullDn: boolean }): void;
  validityDrafts: React.RefObject<{ relative: number; exact?: ExactValidity }>;
  issues: ValidationIssue[];
}

const SUBJECT_FIELDS = {
  CN: "Common name",
  O: "Organization",
  OU: "Organizational unit",
  L: "Locality",
  ST: "State or province",
  C: "Country",
  E: "Email",
};
type SubjectField = keyof typeof SUBJECT_FIELDS;

function structuredName(subject: string): Partial<Record<SubjectField, string>> | undefined {
  try {
    if (/(?:^|[,+])\s*[a-z\d.]+\s*=\s*#/i.test(subject)) return;
    if (subject.trim() && validateSubject(subject, { syntaxOnly: true })) return;
    const parts = new Name(subject).toJSON();
    const fields: Partial<Record<SubjectField, string>> = {};
    for (const part of parts) {
      const keys = Object.keys(part);
      const key = keys[0] as SubjectField;
      if (keys.length !== 1 || !(key in SUBJECT_FIELDS) || part[key].length !== 1 || key in fields)
        return;
      fields[key] = part[key][0];
    }
    return fields;
  } catch {
    return;
  }
}

function localDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
    : "";
}

function isoDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : value;
}

export function CertificateConfigurationEditor({
  configuration: config,
  onChange,
  input,
  preferences,
  onPreferences,
  validityDrafts,
  issues,
}: Props) {
  const { advanced, fullDn } = preferences;
  const [validityError, setValidityError] = React.useState("");
  const fields = structuredName(config.subject);
  const requested = input.requested;
  const fieldError = (field: string) => issues.find((issue) => issue.field === field)?.message;
  const changeSubject = (key: SubjectField, value: string) => {
    if (!fields) return;
    const literal = (field: string, text: string) => ({
      [field]: [
        {
          ...(field === "E"
            ? { ia5String: text }
            : field === "C"
              ? { printableString: text }
              : { utf8String: text }),
        },
      ],
    });
    const current: JsonNameParams = new Name(config.subject).toJSON().map((part) => {
      const field = Object.keys(part)[0];
      return literal(field, part[field][0]);
    });
    const index = current.findIndex((part) => key in part);
    if (index !== -1) {
      if (value) current[index] = literal(key, value);
      else current.splice(index, 1);
    } else if (value) current.push(literal(key, value));
    onChange({ ...config, subject: new Name(current).toString() });
  };
  const switchValidity = () => {
    setValidityError("");
    if (config.validity.mode === "relative") {
      const now = new Date(Math.floor(Date.now() / 1000) * 1000);
      const end = new Date(now.getTime() + config.validity.days * 86_400_000);
      if (
        !Number.isFinite(config.validity.days) ||
        config.validity.days <= 0 ||
        !Number.isFinite(end.getTime()) ||
        end.getUTCFullYear() > 9999
      ) {
        setValidityError("Enter a valid positive duration before switching to exact dates.");
        return;
      }
      const previousExact =
        validityDrafts.current.relative === config.validity.days
          ? validityDrafts.current.exact
          : undefined;
      validityDrafts.current.relative = config.validity.days;
      onChange({
        ...config,
        validity: previousExact ?? {
          mode: "exact",
          notBefore: now.toISOString(),
          notAfter: end.toISOString(),
        },
      });
    } else {
      validityDrafts.current.exact = config.validity;
      onChange({
        ...config,
        validity: { mode: "relative", days: validityDrafts.current.relative },
      });
    }
  };
  const updateSan = (index: number, entry: SubjectAlternativeName) =>
    onChange({
      ...config,
      san: {
        ...config.san,
        entries: config.san.entries.map((item, i) => (i === index ? entry : item)),
      },
    });
  return (
    <Stack spacing={1}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={advanced ? "advanced" : "basic"}
        onChange={(_, value: string | null) => {
          if (value) onPreferences({ ...preferences, advanced: value === "advanced" });
        }}
        aria-label="Configuration mode"
      >
        <ToggleButton value="basic">Basic</ToggleButton>
        <ToggleButton value="advanced">Advanced</ToggleButton>
      </ToggleButtonGroup>
      {requested && (
        <Alert severity="info">
          <Typography variant="body2">
            CSR requests are suggestions. Apply only the fields you intend to issue.
          </Typography>
          <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
            Requested subject: {requested.subject || "Empty"}
          </Typography>
          <Typography variant="body2">
            Requested SAN:{" "}
            {requested.san.entries.map((entry) => `${entry.type}: ${entry.value}`).join(", ") ||
              "None"}
          </Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1, mt: 1 }}>
            <Button
              size="small"
              onClick={() => onChange({ ...config, subject: requested.subject })}
            >
              Apply requested subject
            </Button>
            <Button
              size="small"
              onClick={() =>
                onChange({
                  ...config,
                  san: {
                    entries: requested.san.entries.map((entry) => ({ ...entry })),
                    critical: requested.san.critical,
                  },
                })
              }
            >
              Apply requested SAN
            </Button>
            {(requested.keyUsage || requested.extendedKeyUsage) && (
              <Button
                size="small"
                onClick={() =>
                  onChange({
                    ...config,
                    ...(requested.keyUsage
                      ? {
                          keyUsage: {
                            usages: [...requested.keyUsage.usages],
                            critical: requested.keyUsage.critical,
                          },
                        }
                      : {}),
                    ...(requested.extendedKeyUsage
                      ? {
                          extendedKeyUsage: {
                            oids: [...requested.extendedKeyUsage.oids],
                            critical: requested.extendedKeyUsage.critical,
                          },
                        }
                      : {}),
                  })
                }
              >
                Apply requested usages
              </Button>
            )}
          </Stack>
          {requested.extensions.length > 0 && (
            <Typography variant="caption" component="p">
              Requested extensions:{" "}
              {requested.extensions
                .map(
                  (extension) =>
                    `${extension.name}${extension.critical ? " (critical)" : ""}${!extension.supported ? " (partly supported or unsupported)" : ""}`,
                )
                .join(", ")}
            </Typography>
          )}
          {requested.notices.map((notice) => (
            <Typography variant="body2" key={notice} sx={{ mt: 1 }}>
              {notice}
            </Typography>
          ))}
        </Alert>
      )}
      <Accordion
        defaultExpanded
        disableGutters
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography sx={{ fontWeight: 600 }}>Subject & validity</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Button
                size="small"
                onClick={() => onPreferences({ ...preferences, fullDn: !fullDn })}
              >
                {fullDn ? "Use structured fields" : "Edit full DN"}
              </Button>
            </Box>
            {fullDn || !fields ? (
              <>
                <TextField
                  label="Full subject distinguished name"
                  value={config.subject}
                  onChange={(event) => onChange({ ...config, subject: event.target.value })}
                  fullWidth
                  multiline
                  minRows={2}
                  helperText="Use DN syntax, for example CN=example.test, O=GoodKey, C=US. An empty subject requires a critical SAN."
                />
                {!fields && (
                  <Alert severity="info">
                    This DN uses attributes or values that need the full editor. Its exact text is
                    preserved when changing modes.
                  </Alert>
                )}
              </>
            ) : (
              <Box
                sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}
              >
                {(Object.keys(SUBJECT_FIELDS) as SubjectField[])
                  .filter((key) => advanced || key === "CN" || key === "O")
                  .map((key) => (
                    <TextField
                      key={key}
                      label={SUBJECT_FIELDS[key]}
                      size="small"
                      value={fields[key] ?? ""}
                      onChange={(event) => changeSubject(key, event.target.value)}
                    />
                  ))}
              </Box>
            )}
            {config.validity.mode === "relative" ? (
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ alignItems: { sm: "center" } }}
              >
                <TextField
                  label="Valid for (days)"
                  error={!!fieldError("validity.days")}
                  helperText={fieldError("validity.days")}
                  type="number"
                  size="small"
                  value={Number.isNaN(config.validity.days) ? "" : config.validity.days}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      validity: {
                        mode: "relative",
                        days: event.target.value === "" ? Number.NaN : Number(event.target.value),
                      },
                    })
                  }
                />
                <Typography variant="body2" color="text.secondary">
                  Starts at issuance
                </Typography>
                <Button onClick={switchValidity}>Use exact dates</Button>
              </Stack>
            ) : (
              <>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: 2,
                  }}
                >
                  <TextField
                    label="Not before"
                    type="datetime-local"
                    value={localDate(config.validity.notBefore)}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
                    onChange={(event) =>
                      onChange({
                        ...config,
                        validity: {
                          ...config.validity,
                          mode: "exact",
                          notBefore: isoDate(event.target.value),
                          notAfter:
                            config.validity.mode === "exact" ? config.validity.notAfter : "",
                        },
                      })
                    }
                  />
                  <TextField
                    label="Not after"
                    type="datetime-local"
                    value={localDate(config.validity.notAfter)}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
                    onChange={(event) =>
                      onChange({
                        ...config,
                        validity: {
                          ...config.validity,
                          mode: "exact",
                          notAfter: isoDate(event.target.value),
                          notBefore:
                            config.validity.mode === "exact" ? config.validity.notBefore : "",
                        },
                      })
                    }
                  />
                </Box>
                <Typography variant="caption">
                  Dates use your local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}
                  ); review also shows UTC.
                </Typography>
                <Button sx={{ alignSelf: "flex-start" }} onClick={switchValidity}>
                  Use duration
                </Button>
              </>
            )}
            {validityError && <Alert severity="error">{validityError}</Alert>}
          </Stack>
        </AccordionDetails>
      </Accordion>
      <Accordion
        defaultExpanded
        disableGutters
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography sx={{ fontWeight: 600 }}>Subject alternative names</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            {config.san.entries.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No alternative names configured.
              </Typography>
            )}
            {config.san.entries.map((entry, index) => (
              <Stack key={index} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                <TextField
                  select
                  label={`Name ${index + 1} type`}
                  size="small"
                  value={entry.type}
                  sx={{ minWidth: 100 }}
                  onChange={(event) =>
                    updateSan(index, {
                      type: event.target.value as SubjectAlternativeName["type"],
                      value: entry.value,
                    })
                  }
                >
                  {[
                    ["dns", "DNS"],
                    ["ip", "IP"],
                    ["email", "Email"],
                    ["url", "URI"],
                  ].map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label={`Name ${index + 1}`}
                  size="small"
                  fullWidth
                  value={entry.value}
                  onChange={(event) => updateSan(index, { ...entry, value: event.target.value })}
                />
                <IconButton
                  aria-label={`Remove name ${index + 1}`}
                  onClick={() =>
                    onChange({
                      ...config,
                      san: {
                        ...config.san,
                        entries: config.san.entries.filter((_, i) => i !== index),
                      },
                    })
                  }
                >
                  <Close />
                </IconButton>
              </Stack>
            ))}
            <Stack direction="row" sx={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <Button
                startIcon={<Add />}
                onClick={() =>
                  onChange({
                    ...config,
                    san: {
                      ...config.san,
                      entries: [...config.san.entries, { type: "dns", value: "" }],
                    },
                  })
                }
              >
                Add name
              </Button>
              {advanced && (
                <FormControlLabel
                  label="SAN critical"
                  control={
                    <Checkbox
                      checked={config.san.critical}
                      onChange={(event) =>
                        onChange({
                          ...config,
                          san: { ...config.san, critical: event.target.checked },
                        })
                      }
                    />
                  }
                />
              )}
            </Stack>
          </Stack>
        </AccordionDetails>
      </Accordion>
      {advanced ? (
        <Accordion
          defaultExpanded
          disableGutters
          elevation={0}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography sx={{ fontWeight: 600 }}>Key usages</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={2}>
              <FormControlLabel
                label="Key usage critical"
                control={
                  <Checkbox
                    checked={config.keyUsage.critical}
                    onChange={(event) =>
                      onChange({
                        ...config,
                        keyUsage: { ...config.keyUsage, critical: event.target.checked },
                      })
                    }
                  />
                }
              />
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                {(Object.keys(KEY_USAGE_LABELS) as KeyUsage[]).map((usage) => (
                  <FormControlLabel
                    key={usage}
                    label={KEY_USAGE_LABELS[usage]}
                    control={
                      <Checkbox
                        checked={config.keyUsage.usages.includes(usage)}
                        onChange={(event) =>
                          onChange({
                            ...config,
                            keyUsage: {
                              ...config.keyUsage,
                              usages: event.target.checked
                                ? [...config.keyUsage.usages, usage]
                                : config.keyUsage.usages.filter((item) => item !== usage),
                            },
                          })
                        }
                      />
                    }
                  />
                ))}
              </Box>
              <Autocomplete
                multiple
                freeSolo
                options={Object.keys(EXTENDED_KEY_USAGE_LABELS)}
                value={config.extendedKeyUsage.oids}
                getOptionLabel={(option) =>
                  EXTENDED_KEY_USAGE_LABELS[option]
                    ? `${EXTENDED_KEY_USAGE_LABELS[option]} (${option})`
                    : option
                }
                onChange={(_, oids) =>
                  onChange({ ...config, extendedKeyUsage: { ...config.extendedKeyUsage, oids } })
                }
                renderValue={(items, getItemProps) =>
                  items.map((oid, index) => (
                    <Chip
                      label={EXTENDED_KEY_USAGE_LABELS[oid] ?? oid}
                      {...getItemProps({ index })}
                      key={oid}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Extended key usages (EKU)"
                    helperText="Select a usage or type a numeric OID and press Enter."
                  />
                )}
              />
              <FormControlLabel
                label="Extended key usage critical"
                control={
                  <Checkbox
                    checked={config.extendedKeyUsage.critical}
                    onChange={(event) =>
                      onChange({
                        ...config,
                        extendedKeyUsage: {
                          ...config.extendedKeyUsage,
                          critical: event.target.checked,
                        },
                      })
                    }
                  />
                }
              />
            </Stack>
          </AccordionDetails>
        </Accordion>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          Advanced usage and critical-extension settings are preserved. Check the certificate
          preview or open Advanced to edit them.
        </Typography>
      )}
    </Stack>
  );
}
