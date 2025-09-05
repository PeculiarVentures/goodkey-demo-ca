import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  List,
  ListItem,
  Radio,
  RadioGroup,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import * as React from "react";

import { SshEnrollParams, SshCertificateType, useSshCaContext } from "./SshProvider";
import { SshCertificateDetails } from "./SshCertificateDetails";
import { useApplicationContext } from "./AppProvider";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const CERTIFICATE_BACKDATE_MS = 5 * 60 * 1000;

export interface SshIssueCertificateViewProps { }

export const SshIssueCertificateView: React.FC<
  SshIssueCertificateViewProps
> = () => {
  const { setError } = useApplicationContext();
  const { enrollCertificate, value: caValue } = useSshCaContext();
  const [activeStep, setActiveStep] = React.useState<number>(0);
  const [cert, setCert] = React.useState<string>("");
  const [sshPublicKey, setSshPublicKey] = React.useState<string>("");
  const [keyId, setKeyId] = React.useState<string>("user@demo");
  const [principals, setPrincipals] = React.useState<string>("user,demo");
  const [validityDays, setValidityDays] = React.useState<number>(30);
  const [certType, setCertType] = React.useState<SshCertificateType>("user");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  React.useEffect(() => {
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const contents = e.target?.result;
        if (typeof contents === "string") {
          setSshPublicKey(contents.trim());
        }
      };
      reader.readAsText(file);
    }
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === "file") {
          setFile(e.dataTransfer.items[i].getAsFile());
        }
      }
    }
  };

  const handleSshPublicKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSshPublicKey(e.target.value);
  };

  const handleImportKey = () => {
    if (!sshPublicKey.trim()) {
      setError(new Error("SSH public key is empty, please paste a valid SSH public key"));
      return;
    }
    setActiveStep(1);
  };

  const handleBack = () => {
    setActiveStep(activeStep - 1);
  };

  const handleKeyIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyId(e.target.value);
  };

  const handlePrincipalsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrincipals(e.target.value);
  };

  const handleValidityDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidityDays(parseInt(e.target.value) || 30);
  };

  const handleCertTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCertType(e.target.value as SshCertificateType);
  };

  const handleIssue = () => {
    (async () => {
      if (!sshPublicKey.trim()) {
        setError(new Error("SSH public key is empty"));
        return;
      }

      try {
        const now = new Date();
        const validAfter = new Date(now.getTime() - CERTIFICATE_BACKDATE_MS);
        const validBefore = new Date(now.getTime() + validityDays * MILLISECONDS_PER_DAY);

        const params: SshEnrollParams = {
          principals: principals.split(',').map(p => p.trim()).filter(p => p),
          validAfter,
          validBefore,
          certType,
          keyId,
        };

        const issuedCert = await enrollCertificate(sshPublicKey, params);
        setCert(issuedCert);
        setActiveStep(2);
      } catch (e) {
        setError(e as Error);
        return;
      }
    })();
  };

  const handleDownload = () => {
    const blob = new Blob([cert], {
      type: "text/plain",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${keyId}-cert.pub`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDone = () => {
    setSshPublicKey("");
    setActiveStep(0);
    setCert("");
  };

  const handleCopyPem = () => {
    navigator.clipboard.writeText(cert);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h6" paragraph>
        Issue SSH Certificate
      </Typography>
      <Box>
        <Typography variant="body2">
          Please follow the steps below to issue an SSH certificate:
        </Typography>
        <Stepper activeStep={activeStep} sx={{ mt: 2, mb: 2 }}>
          <Step>
            <StepLabel>Import SSH Public Key</StepLabel>
          </Step>
          <Step>
            <StepLabel>Issue Certificate</StepLabel>
          </Step>
          <Step>
            <StepLabel>Done</StepLabel>
          </Step>
        </Stepper>
      </Box>

      {activeStep === 0 && ( // Import SSH Public Key
        <Box sx={{ mt: 2 }}>
          <Box>
            <Typography variant="body2" paragraph>
              Please paste the SSH public key below:
            </Typography>
            <TextField
              multiline
              fullWidth
              rows={5}
              value={sshPublicKey}
              onChange={handleSshPublicKeyChange}
              placeholder="ssh-rsa AAAAB3NzaC1yc2EAAAA... user@example.com"
              InputProps={{
                style: { fontFamily: "Monaco, monospace", fontSize: "12px" },
              }}
            />
          </Box>
          <Box
            onDrop={(e) => {
              handleDrop(e);
              setIsDragOver(false);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: isDragOver ? "2px dashed lightblue" : "2px dashed gray",
              padding: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100px",
              mt: 2,
              cursor: "pointer",
            }}
          >
            <Typography
              variant="body2"
              paragraph
              sx={{ pointerEvents: "none" }}
            >
              Drag and drop SSH public key file here or click here to upload
            </Typography>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
              accept=".pub,.pem,.txt"
            />
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
            <Button onClick={handleImportKey}>Next</Button>
          </Box>
        </Box>
      )}

      {activeStep === 1 && ( // Issue Certificate
        <Box>
          <Typography variant="body2" paragraph>
            Please enter the SSH certificate details below:
          </Typography>
          <List sx={{ width: "100%" }}>
            <ListItem>
              <TextField
                label="Key ID"
                value={keyId}
                onChange={handleKeyIdChange}
                size="small"
                sx={{ width: "100%" }}
                helperText="Identifier for this certificate (e.g., user@hostname)"
              />
            </ListItem>
            <ListItem>
              <TextField
                label="Principals"
                value={principals}
                onChange={handlePrincipalsChange}
                size="small"
                sx={{ width: "100%" }}
                helperText="Comma-separated list of principals (usernames for user certs, hostnames for host certs)"
              />
            </ListItem>
            <ListItem>
              <TextField
                label="Validity (days)"
                type="number"
                value={validityDays}
                onChange={handleValidityDaysChange}
                size="small"
                sx={{ width: "100%" }}
                helperText="Certificate validity period in days"
              />
            </ListItem>
            <ListItem>
              <FormControl component="fieldset">
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Certificate Type</Typography>
                <RadioGroup
                  value={certType}
                  onChange={handleCertTypeChange}
                  row
                >
                  <FormControlLabel
                    value="user"
                    control={<Radio />}
                    label="User Certificate"
                  />
                  <FormControlLabel
                    value="host"
                    control={<Radio />}
                    label="Host Certificate"
                  />
                </RadioGroup>
              </FormControl>
            </ListItem>
          </List>
          <Box
            sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 1 }}
          >
            <Button onClick={handleBack}>Back</Button>
            <Button onClick={handleIssue}>Issue Certificate</Button>
          </Box>
        </Box>
      )}

      {activeStep === 2 && ( // Done
        <Box>
          <Typography variant="body2" paragraph>
            SSH certificate issued successfully.
          </Typography>
          <SshCertificateDetails certificate={cert} caPublicKey={caValue?.publicKey} />
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" paragraph>
              Issued SSH certificate:
            </Typography>
            <TextField
              multiline
              fullWidth
              rows={5}
              value={cert}
              InputProps={{
                readOnly: true,
                style: { fontFamily: "Monaco, monospace", fontSize: "12px" },
              }}
            />
          </Box>
          <Box
            sx={{ display: "flex", justifyContent: "flex-end", mt: 2, gap: 1 }}
          >
            <Button onClick={handleDone}>Done</Button>
            <Button onClick={handleCopyPem}>Copy</Button>
            <Button onClick={handleDownload}>Download</Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};
