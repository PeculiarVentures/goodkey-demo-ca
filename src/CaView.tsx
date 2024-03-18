import { Box, Button, ButtonGroup, FormControl, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, TextField, Tooltip, Typography } from "@mui/material";
import * as React from 'react';
import { DeleteForever, Download } from "@mui/icons-material";

import { useCaContext } from "./CaProvider";
import { CertificateDetails } from "./CertificateDetails";
import { CaIssueCertificateView } from "./CaIssueCertificateView";
import { useApplicationContext } from "./AppProvider";

export interface CaViewProps {

}

interface StateBoxParams {
  state: number;
  value: number;
  children: React.ReactNode;
}

const StateBox: React.FC<StateBoxParams> = ({ state, value, children }) => {
  return state === value ? (
    <>
      {children}
    </>
  ) : null;
};

export const CaView: React.FC<CaViewProps> = () => {
  const { showConfirmDialog } = useApplicationContext();
  const { value, name, initialize, download, remove } = useCaContext();
  const [caName, setCaName] = React.useState<string>('CN=Demo CA, O=GoodKey, C=US');
  const [keyAlgorithm, setKeyAlgorithm] = React.useState<string>('rsa2048');

  const handleCaNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCaName(e.target.value);
  };

  const handleInitialize = () => {
    initialize(caName, keyAlgorithm);
  };

  const handleAlgorithmChange = (e: SelectChangeEvent<string>) => {
    setKeyAlgorithm(e.target.value);
  };

  const handleRemove = () => {
    showConfirmDialog({
      title: 'Remove CA',
      message: 'Are you sure you want to remove this CA?',
      onConfirm: () => {
        remove();
      },
    });
  };

  const handleDownload = () => {
    download();
  };


  const state = value ? 2 : 1;
  const caCert = value?.cert || '';

  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      {/* Initialize CA */}
      <StateBox state={state} value={1}>

        <Typography variant="h6" paragraph>
          Initialize CA
        </Typography>
        <Typography variant="body2" paragraph>
          A Demo CA has not been created yet. You can create one here. Keys and certificates will be stored in the browser's IndexedDB.
        </Typography>
        <Typography variant="body2" paragraph>
          Please specify the certificate name and key algorithm for the CA (eg CN=Demo CA, O=GoodKey, C=US).
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            variant="outlined"
            margin="normal"
            fullWidth
            label="Certificate Name"
            value={caName}
            onChange={handleCaNameChange}
            size='small'
          />
          <FormControl fullWidth>
            <InputLabel id="key-algorithm-label" >Key Algorithm</InputLabel>
            <Select labelId="key-algorithm-label" label="Key Algorithm" value={keyAlgorithm} onChange={handleAlgorithmChange} size='small'>
              <MenuItem value='rsa2048'>RSA 2048</MenuItem>
              <MenuItem value='rsa4096'>RSA 4096</MenuItem>
              <MenuItem value='ecp256'>EC P-256</MenuItem>
              <MenuItem value='ecp384'>EC P-384</MenuItem>
              <MenuItem value='ecp521'>EC P-521</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          sx={{ mt: 2 }}
          onClick={handleInitialize}>
          Initialize
        </Button>
      </StateBox>
      {/* CA initialized */}
      <StateBox state={state} value={2}>
        <Typography variant='h6' paragraph sx={{ flexGrow: 1 }}>Certificate Authority</Typography>
        <Typography variant='body2' paragraph>
          This is a demo Certificate Authority. Private key and certificate are stored in the browser's IndexedDB.
          This CA is intended for demo purposes only and is not trusted by any browser or operating system.
        </Typography>
        <Box>
          <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flexGrow: 1 }} />
            <ButtonGroup variant="outlined" size="small" color="primary">
              <Tooltip title="Download CA Certificate">
                <Button onClick={handleDownload} size="small">
                  <Download fontSize="small" />
                </Button>
              </Tooltip>
              <Tooltip title="Remove CA">
                <Button onClick={handleRemove} size="small">
                  <DeleteForever fontSize="small" />
                </Button>
              </Tooltip>
            </ButtonGroup>
          </Box>
          <CertificateDetails certificate={caCert} />
        </Box>
        <CaIssueCertificateView />
      </StateBox>
    </Paper>
  );
};
