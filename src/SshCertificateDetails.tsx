import { Box, Typography } from "@mui/material";
import * as React from "react";
import * as ssh from "@peculiar/ssh";

export interface SshCertificateDetailsProps {
  certificate: string;
  caPublicKey?: string;
}

export const SshCertificateDetails: React.FC<SshCertificateDetailsProps> = ({
  certificate,
  caPublicKey,
}) => {
  const [certDetails, setCertDetails] = React.useState<ssh.SshCertificate | null>(null);
  const [certFingerprint, setCertFingerprint] = React.useState<string>('');
  const [caFingerprint, setCaFingerprint] = React.useState<string>('');
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    if (certificate) {
      try {
        // Parse SSH certificate
        (async () => {
          try {
            const cert = await ssh.SshCertificate.fromSSH(certificate);
            setCertDetails(cert);

            // Calculate certificate fingerprint
            const fingerprint = await ssh.SSH.thumbprint('sha256', cert, 'ssh');
            setCertFingerprint(fingerprint);

            // Calculate CA fingerprint if CA public key is provided
            if (caPublicKey) {
              const caKey = await ssh.SshPublicKey.fromSSH(caPublicKey);
              const caFp = await ssh.SSH.thumbprint('sha256', caKey, 'ssh');
              setCaFingerprint(caFp);
            }

            setError("");
          } catch (e) {
            setError(`Failed to parse SSH certificate: ${e}`);
          }
        })();
      } catch (e) {
        setError(`Failed to parse SSH certificate: ${e}`);
      }
    }
  }, [certificate, caPublicKey]);

  if (error) {
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" color="error">
          Certificate Parse Error
        </Typography>
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      </Box>
    );
  }

  if (!certDetails) {
    return null;
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" paragraph>
        SSH Certificate Details
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {certFingerprint && (
          <Typography variant="body2">
            <strong>Public key:</strong> {certDetails?.publicKey?.keyType?.toUpperCase()}-CERT {certFingerprint}
          </Typography>
        )}
        {caFingerprint && (
          <Typography variant="body2">
            <strong>Signing CA:</strong> {certDetails?.signatureKey?.keyType?.toUpperCase()} {caFingerprint} (using {certDetails?.signatureKey?.keyType})
          </Typography>
        )}
        <Typography variant="body2">
          <strong>Type:</strong> {certDetails.certType}
        </Typography>
        <Typography variant="body2">
          <strong>Key ID:</strong> {certDetails.keyId}
        </Typography>
        <Typography variant="body2">
          <strong>Serial:</strong> {certDetails.serial.toString()}
        </Typography>
        <Typography variant="body2">
          <strong>Valid From:</strong> {certDetails.validAfter.toLocaleString()}
        </Typography>
        <Typography variant="body2">
          <strong>Valid To:</strong> {certDetails.validBefore.toLocaleString()}
        </Typography>
        <Typography variant="body2">
          <strong>Principals:</strong> {certDetails.principals.join(", ")}
        </Typography>
        <Typography variant="body2">
          <strong>Extensions:</strong>
        </Typography>
        <Box sx={{ ml: 2 }}>
          {Object.entries(certDetails.extensions).map(([key, value]) => (
            <Typography key={key} variant="body2" sx={{ fontSize: "0.875rem" }}>
              • {key}: {String(value) || "(empty)"}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
