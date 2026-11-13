import { Alert, Stack, Table, TableBody, TableCell, TableRow, Typography } from "@mui/material";
import {
  EXTENDED_KEY_USAGE_LABELS,
  KEY_USAGE_LABELS,
  type ResolvedX509Configuration,
  type ValidationIssue,
  type X509Configuration,
} from "../certificates";

interface Props {
  configuration: X509Configuration;
  resolved?: ResolvedX509Configuration;
  issuer: string;
  publicKey: string;
  issues?: ValidationIssue[];
}

export function CertificateSummary({
  configuration: config,
  resolved,
  issuer,
  publicKey,
  issues = [],
}: Props) {
  const critical = (value: boolean) => (value ? " · critical" : "");
  const rows = [
    ["Subject", config.subject || "Empty (identity in SAN)"],
    ["Issuer", issuer],
    ["Public key", publicKey],
    [
      "Validity",
      resolved
        ? `${new Date(resolved.notBefore).toLocaleString()} → ${new Date(resolved.notAfter).toLocaleString()}`
        : config.validity.mode === "relative"
          ? `${config.validity.days} days · starts at issuance`
          : `${config.validity.notBefore} → ${config.validity.notAfter}`,
    ],
    [
      "Subject alternative names" + critical(config.san.critical),
      config.san.entries
        .map(
          (entry) => `${entry.type === "url" ? "URI" : entry.type.toUpperCase()}: ${entry.value}`,
        )
        .join("; ") || "None",
    ],
    [
      "Key usage" + critical(config.keyUsage.critical),
      config.keyUsage.usages.map((usage) => KEY_USAGE_LABELS[usage]).join(", ") || "Omitted",
    ],
    [
      "Extended key usage" + critical(config.extendedKeyUsage.critical),
      config.extendedKeyUsage.oids
        .map((oid) => `${EXTENDED_KEY_USAGE_LABELS[oid] ?? "Custom"} (${oid})`)
        .join(", ") || "Omitted",
    ],
    ["Basic constraints · critical", "End entity (cA=false)"],
  ];
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Certificate preview</Typography>
      <Table size="small" aria-label="Effective certificate settings">
        <TableBody>
          {rows.map(([label, value]) => (
            <TableRow key={label}>
              <TableCell
                sx={{ width: "34%", verticalAlign: "top", color: "text.secondary", pl: 0 }}
              >
                {label}
              </TableCell>
              <TableCell sx={{ overflowWrap: "anywhere", pr: 0 }}>{value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {resolved && (
        <Typography variant="caption">
          Exact validity (UTC): {resolved.notBefore} → {resolved.notAfter}
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        Issuer, random serial number, subject key identifier (SKI), and authority key identifier
        (AKI) are generated automatically. Templates never contain keys or certificate inputs.
      </Typography>
      {issues.length > 0 && (
        <Alert severity="error">
          <Typography sx={{ fontWeight: 600 }}>Resolve these settings before issuing:</Typography>
          <ul>
            {issues.map((issue, index) => (
              <li key={`${issue.field}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </Alert>
      )}
    </Stack>
  );
}
