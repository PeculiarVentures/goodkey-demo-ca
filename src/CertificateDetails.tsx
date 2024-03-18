import { Table, TableBody, TableCell, TableContainer, TableRow, Typography } from "@mui/material";
import { X509Certificate } from "@peculiar/x509";
import * as React from 'react';
import { useApplicationContext } from "./AppProvider";
import { Convert } from "pvtsutils";

export interface CertificateDetailsProps {
  certificate: string | X509Certificate;
}

export interface CertificateDetails {
  serialNumber: string;
  subject: string;
  issuer: string;
  validityDays: number;
  leftDays: number;
  algorithm: string;
  thumbprint: Record<string, string>;
}

export const CertificateDetails: React.FC<CertificateDetailsProps> = ({ certificate }) => {
  const { setError } = useApplicationContext();
  const [details, setDetails] = React.useState<CertificateDetails>();

  React.useEffect(() => {
    (async () => {
      const details = {} as CertificateDetails;
      const cert = typeof certificate === 'string' ? new X509Certificate(certificate) : certificate;

      details.validityDays = (cert.notAfter.getTime() - cert.notBefore.getTime()) / (1000 * 60 * 60 * 24);
      details.leftDays = (cert.notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

      details.algorithm = '';
      switch (cert.publicKey.algorithm.name) {
        case 'RSASSA-PKCS1-v1_5':
          details.algorithm = `RSA ${(cert.publicKey.algorithm as RsaHashedKeyAlgorithm).modulusLength}`;
          break;
        case 'ECDSA':
          details.algorithm = `EC ${(cert.publicKey.algorithm as EcKeyAlgorithm).namedCurve}`;
          break;
        default:
          details.algorithm = cert.publicKey.algorithm.name;
          break;
      }

      details.serialNumber = cert.serialNumber;
      details.subject = cert.subject;
      details.issuer = cert.issuer;

      const hashes = ["SHA-1", "SHA-256"];
      details.thumbprint = {};
      for (const hash of hashes) {
        const thumbprint = await cert.getThumbprint(hash);
        details.thumbprint[hash] = Convert.ToHex(thumbprint);
      }

      setDetails(details);
    })()
      .catch((e) => {
        setError(e);
      });
  }, [certificate]);

  return (
    <TableContainer>
      <Typography paragraph variant='subtitle1'>Certificate details:</Typography>
      {
        !details ? (
          <Typography paragraph variant='body2'>Loading...</Typography>
        ) : (
          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell>Serial Number</TableCell>
                <TableCell>{details.serialNumber}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Subject</TableCell>
                <TableCell>{details.subject}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Issuer</TableCell>
                <TableCell>{details.issuer}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Validity (days)</TableCell>
                <TableCell>{`${details.validityDays} (${details.leftDays.toFixed(0)} left)`}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Public Key</TableCell>
                <TableCell>{details.algorithm}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Thumbprint</TableCell>
                <TableCell>
                  <Typography variant='body2' color='text.secondary'>SHA-1: {details.thumbprint["SHA-1"]}</Typography>
                  <Typography variant='body2' color='text.secondary'>SHA-256: {details.thumbprint["SHA-256"]}</Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )
      }
    </TableContainer>
  );
};