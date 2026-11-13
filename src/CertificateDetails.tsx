import {
  Alert,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from "@mui/material";
import * as x509 from "@peculiar/x509";
import * as React from "react";
import { Convert } from "pvtsutils";
import { EXTENDED_KEY_USAGE_LABELS, KEY_USAGE_LABELS, type KeyUsage } from "./certificates";

export interface CertificateDetailsProps {
  certificate: string | x509.X509Certificate;
}

function extensionValue(extension: x509.Extension): string {
  if (extension instanceof x509.BasicConstraintsExtension)
    return `cA=${extension.ca}${extension.pathLength !== undefined ? `, path length=${extension.pathLength}` : ""}`;
  if (extension instanceof x509.SubjectAlternativeNameExtension)
    return extension.names
      .toJSON()
      .map((name) => `${name.type === "url" ? "URI" : name.type.toUpperCase()}: ${name.value}`)
      .join("; ");
  if (extension instanceof x509.KeyUsagesExtension) {
    const flags: string[] = (Object.keys(KEY_USAGE_LABELS) as KeyUsage[])
      .filter((name) => extension.usages & x509.KeyUsageFlags[name])
      .map((name) => KEY_USAGE_LABELS[name]);
    if (extension.usages & x509.KeyUsageFlags.keyCertSign) flags.push("Certificate signing");
    if (extension.usages & x509.KeyUsageFlags.cRLSign) flags.push("CRL signing");
    return flags.join(", ");
  }
  if (extension instanceof x509.ExtendedKeyUsageExtension)
    return extension.usages
      .map((oid) => `${EXTENDED_KEY_USAGE_LABELS[String(oid)] ?? "Custom"} (${oid})`)
      .join(", ");
  if (extension instanceof x509.SubjectKeyIdentifierExtension) return extension.keyId;
  if (extension instanceof x509.AuthorityKeyIdentifierExtension)
    return extension.keyId ?? `Issuer serial: ${extension.certId?.serialNumber ?? "Unknown"}`;
  return Convert.ToHex(extension.value);
}

const EXTENSION_NAMES: Record<string, string> = {
  "2.5.29.19": "Basic constraints",
  "2.5.29.17": "Subject alternative names",
  "2.5.29.15": "Key usage",
  "2.5.29.37": "Extended key usage",
  "2.5.29.14": "Subject key identifier (SKI)",
  "2.5.29.35": "Authority key identifier (AKI)",
};

export function CertificateDetails({ certificate }: CertificateDetailsProps) {
  const [details, setDetails] = React.useState<{
    cert: x509.X509Certificate;
    thumbprint: string;
  }>();
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let cancelled = false;
    setDetails(undefined);
    setError("");
    void (async () => {
      const cert =
        typeof certificate === "string" ? new x509.X509Certificate(certificate) : certificate;
      const thumbprint = Convert.ToHex(await cert.getThumbprint("SHA-256"));
      if (!cancelled) setDetails({ cert, thumbprint });
    })().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Cannot read certificate.");
    });
    return () => {
      cancelled = true;
    };
  }, [certificate]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!details) return <Typography role="status">Loading certificate details…</Typography>;
  const { cert, thumbprint } = details;
  const algorithm = cert.publicKey.algorithm;
  const key =
    "modulusLength" in algorithm
      ? `RSA ${algorithm.modulusLength}`
      : "namedCurve" in algorithm
        ? `${algorithm.name} ${algorithm.namedCurve}`
        : algorithm.name;
  const rows = [
    ["Serial number", cert.serialNumber],
    ["Subject", cert.subject || "Empty"],
    ["Issuer", cert.issuer],
    ["Not before (UTC)", cert.notBefore.toISOString()],
    ["Not after (UTC)", cert.notAfter.toISOString()],
    ["Public key", key],
    ["SHA-256 thumbprint", thumbprint],
  ];
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Certificate details</Typography>
      <TableContainer>
        <Table size="small" aria-label="Issued certificate details">
          <TableBody>
            {rows.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell sx={{ verticalAlign: "top", width: "30%" }}>{label}</TableCell>
                <TableCell sx={{ overflowWrap: "anywhere" }}>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="subtitle1">Actual certificate extensions</Typography>
      <TableContainer>
        <Table size="small" aria-label="Actual certificate extensions">
          <TableBody>
            {cert.extensions.map((extension) => (
              <TableRow key={extension.type}>
                <TableCell sx={{ verticalAlign: "top", width: "30%" }}>
                  {EXTENSION_NAMES[extension.type] ?? extension.type}
                  <Typography variant="caption" component="div" color="text.secondary">
                    {extension.type}
                    {extension.critical ? " · critical" : " · non-critical"}
                  </Typography>
                </TableCell>
                <TableCell sx={{ overflowWrap: "anywhere" }}>{extensionValue(extension)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
