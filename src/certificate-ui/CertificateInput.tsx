import { Alert, Box, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material";
import { UploadFile } from "@mui/icons-material";
import type { ParsedCertificateInput } from "../certificates";

interface Props {
  text: string;
  fileName: string;
  parsed?: ParsedCertificateInput;
  pending: boolean;
  error: string;
  onText(value: string): void;
  onFile(file: File): void;
}

export function CertificateInput({
  text,
  fileName,
  parsed,
  pending,
  error,
  onText,
  onFile,
}: Props) {
  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">
        Import a CSR, SPKI public key, or X.509 certificate in PEM or DER format.
      </Typography>
      <TextField
        label="Certificate request or public key (PEM)"
        multiline
        minRows={8}
        maxRows={14}
        fullWidth
        value={text}
        onChange={(event) => onText(event.target.value)}
        slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 12 } } }}
      />
      <Paper
        variant="outlined"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        sx={{ p: 2, borderStyle: "dashed", textAlign: "center" }}
      >
        <Button component="label" startIcon={<UploadFile />}>
          Choose PEM or DER file
          <input
            aria-label="Upload certificate input"
            type="file"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = "";
            }}
          />
        </Button>
        <Typography variant="body2" color="text.secondary">
          {fileName || "Or drag and drop a file here · maximum 1 MiB"}
        </Typography>
      </Paper>
      {pending && <Typography role="status">Verifying input…</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {parsed && (
        <Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
            <Chip color="success" label={`${parsed.type.toUpperCase()} imported`} />
            <Chip label={parsed.metadata.label} />
            <Chip label={parsed.format.toUpperCase()} />
          </Stack>
          <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
            Public key SHA-256: {parsed.metadata.fingerprint}
          </Typography>
          {parsed.csrSignatureVerified && (
            <Alert severity="success" sx={{ mt: 2 }}>
              CSR signature verified. This proves possession of the signing key; the requested
              identity has not been verified.
            </Alert>
          )}
          {parsed.type === "certificate" && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Only the public key is imported. Certificate identity, extensions, and trust are not
              copied.
            </Alert>
          )}
        </Box>
      )}
    </Stack>
  );
}
