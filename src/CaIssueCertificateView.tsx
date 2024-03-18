import { Box, Button, List, ListItem, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import * as React from 'react';
import { Pkcs10CertificateRequest, X509Certificate } from "@peculiar/x509";
import { Convert } from "pvtsutils";

import { CertificateDetails } from "./CertificateDetails";
import { useCaContext } from "./CaProvider";
import { useApplicationContext } from "./AppProvider";

export interface CaIssueCertificateViewProps {
}

export const CaIssueCertificateView: React.FC<CaIssueCertificateViewProps> = () => {
  const { setError } = useApplicationContext();
  const { enrollCertificate } = useCaContext();
  const [activeStep, setActiveStep] = React.useState<number>(0);
  const [cert, setCert] = React.useState<string>('');
  const [csr, setCsr] = React.useState<string>('');
  const [certName, setCertName] = React.useState<string>('CN=Test certificate, O=GoodKey, C=US');
  const [certValidity, setCertValidity] = React.useState<number>(365);
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
        if (typeof contents === 'string') {
          let csrString: string = '';
          try {
            const csr = contents.charCodeAt(0) === 0x30
              ? new Pkcs10CertificateRequest(Convert.FromBinary(contents))
              : new Pkcs10CertificateRequest(contents);
            csrString = csr.toString('pem');
          } catch (e) {
            setError(e as Error);
            return;
          }

          setCsr(csrString);
        }
      };
      reader.readAsBinaryString(file);
    }
  }, [file]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === 'file') {
          setFile(e.dataTransfer.items[i].getAsFile());
        }
      }
    }
  };

  const handleCsrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsr(e.target.value);
  };

  const handleImportCsr = () => {
    if (!csr) {
      setError(new Error('CSR is empty, please paste a valid CSR in PEM format'));
      return;
    }
    new Pkcs10CertificateRequest(csr);
    setActiveStep(1);
  };

  const handleBack = () => {
    setActiveStep(activeStep - 1);
  };

  const handleCertNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCertName(e.target.value);
  };

  const handleCertValidityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCertValidity(parseInt(e.target.value));
  };

  const handleIssue = () => {
    (async () => {
      const issuedCert = await enrollCertificate(csr, {
        subject: certName,
        validity: certValidity
      });
      setCert(issuedCert.toString());
      setActiveStep(2);
    })();
  };

  const handleDownload = () => {
    (async () => {
      const c = new X509Certificate(cert);
      const thumbprint = await c.getThumbprint();
      const blob = new Blob([c.toString('pem')], { type: 'application/x-x509-ca-cert' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${Convert.ToHex(thumbprint)}.pem`;
      a.click();
      window.URL.revokeObjectURL(url);
    })();
  };

  const handleDone = () => {
    setCsr('');
    setActiveStep(0);
    setCert('');
  };

  const handleCopyPem = () => {
    navigator.clipboard.writeText(cert);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant='h6' paragraph>Issue Certificate</Typography>
      <Box>
        <Typography variant='body2'>
          Please follow the steps below to issue a certificate:
        </Typography>
        <Stepper activeStep={activeStep} sx={{ mt: 2, mb: 2 }}>
          <Step>
            <StepLabel>Import CSR</StepLabel>
          </Step>
          <Step>
            <StepLabel>Issue Certificate</StepLabel>
          </Step>
          <Step>
            <StepLabel>Done</StepLabel>
          </Step>
        </Stepper>
      </Box>
      {
        activeStep === 0 &&
        (
          <Box sx={{ mt: 2 }}>
            <Box>
              <Typography variant='body2' paragraph>Please paste the CSR in PEM format below:</Typography>
              <TextField multiline fullWidth rows={10} value={csr} onChange={handleCsrChange}
                InputProps={{
                  style: { fontFamily: 'Monaco, monospace', fontSize: '12px' }
                }} />
            </Box>
            <Box
              onDrop={(e) => { handleDrop(e); setIsDragOver(false); }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: isDragOver ? '2px dashed lightblue' : '2px dashed gray',
                padding: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100px',
                mt: 2,
                cursor: 'pointer'
              }}
            >
              <Typography variant='body2' paragraph sx={{ pointerEvents: 'none' }}>
                Drag and drop the CSR in DER or PEM format here, or click here to upload
              </Typography>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button onClick={handleImportCsr}>Next</Button>
            </Box>
          </Box>
        )
      }
      {
        activeStep === 1 &&
        (
          <Box>
            <Typography variant='body2' paragraph>Please enter the certificate details below:</Typography>
            <List sx={{ width: '100%' }}>
              <ListItem>
                <TextField label='Name' value={certName} onChange={handleCertNameChange} size='small' sx={{ width: '100%' }} />
              </ListItem>
              <ListItem>
                <TextField label='Validity (days)' value={certValidity} onChange={handleCertValidityChange} size='small' sx={{ width: '100%' }} />
              </ListItem>
            </List>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
              <Button onClick={handleBack}>Back</Button>
              <Button onClick={handleIssue}>Issue</Button>
            </Box>
          </Box>
        )
      }
      {
        activeStep === 2 &&
        (
          <Box>
            <Typography variant='body2' paragraph>Certificate issued successfully.</Typography>
            <CertificateDetails certificate={cert} />
            <Box sx={{ mt: 2 }}>
              <Typography variant='body2' paragraph>Issued certificate in PEM format:</Typography>
              <TextField multiline fullWidth rows={10} value={cert}
                InputProps={{
                  readOnly: true,
                  style: { fontFamily: 'Monaco, monospace', fontSize: '12px' }
                }} />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
              <Button onClick={handleDone}>Done</Button>
              <Button onClick={handleCopyPem}>Copy</Button>
              <Button onClick={handleDownload}>Download</Button>
            </Box>
          </Box>
        )
      }
    </Box>
  );
};;