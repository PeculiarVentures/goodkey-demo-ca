import { Box, Button, ButtonGroup, FormControl, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, TextField, Tooltip, Typography } from "@mui/material";
import * as React from 'react';
import { DeleteForever, Download } from "@mui/icons-material";
import * as ssh from "@peculiar/ssh";

import { useSshCaContext } from "./SshProvider";
import { SshIssueCertificateView } from "./SshIssueCertificateView";
import { useApplicationContext } from "./AppProvider";

export interface SshViewProps {

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

export const SshView: React.FC<SshViewProps> = () => {
  const { showConfirmDialog } = useApplicationContext();
  const { value, name, initialize, download, remove } = useSshCaContext();
  const [caName, setCaName] = React.useState<string>('Demo SSH CA');
  const [keyAlgorithm, setKeyAlgorithm] = React.useState<string>('rsa2048');
  const [caFingerprint, setCaFingerprint] = React.useState<string>('');

  // Calculate CA fingerprint when value changes
  React.useEffect(() => {
    if (value?.publicKey) {
      (async () => {
        try {
          const publicKey = await ssh.SshPublicKey.fromSSH(value.publicKey);
          const fingerprint = await ssh.SSH.thumbprint('sha256', publicKey, 'ssh');
          setCaFingerprint(fingerprint);
        } catch (error) {
          console.error('Failed to calculate CA fingerprint:', error);
          setCaFingerprint('');
        }
      })();
    } else {
      setCaFingerprint('');
    }
  }, [value?.publicKey]);

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
      title: 'Remove SSH CA',
      message: 'Are you sure you want to remove this SSH CA?',
      onConfirm: () => {
        remove();
      },
    });
  };

  const handleDownload = () => {
    download();
  };

  const state = value ? 2 : 1;

  return (
    <Paper elevation={3} sx={{ p: 4 }}>
      {/* Initialize SSH CA */}
      <StateBox state={state} value={1}>
        <Typography variant="h6" paragraph>
          Initialize SSH CA
        </Typography>
        <Typography variant="body2" paragraph>
          A Demo SSH CA has not been created yet. You can create one here. Keys will be stored in the browser's IndexedDB.
        </Typography>
        <Typography variant="body2" paragraph>
          Please specify the CA name and key algorithm for the SSH CA.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            variant="outlined"
            margin="normal"
            fullWidth
            label="CA Name"
            value={caName}
            onChange={handleCaNameChange}
            size='small'
          />
          <FormControl fullWidth>
            <InputLabel id="key-algorithm-label">Key Algorithm</InputLabel>
            <Select labelId="key-algorithm-label" label="Key Algorithm" value={keyAlgorithm} onChange={handleAlgorithmChange} size='small'>
              <MenuItem value='rsa2048'>RSA 2048</MenuItem>
              <MenuItem value='rsa4096'>RSA 4096</MenuItem>
              <MenuItem value='ecp256'>EC P-256</MenuItem>
              <MenuItem value='ecp384'>EC P-384</MenuItem>
              <MenuItem value='ecp521'>EC P-521</MenuItem>
              <MenuItem value='ed25519'>Ed25519</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          sx={{ mt: 2 }}
          onClick={handleInitialize}>
          Initialize SSH CA
        </Button>
      </StateBox>

      {/* SSH CA initialized */}
      <StateBox state={state} value={2}>
        <Typography variant='h6' paragraph sx={{ flexGrow: 1 }}>SSH Certificate Authority</Typography>
        <Typography variant='body2' paragraph>
          This is a demo SSH Certificate Authority. Private key is stored in the browser's IndexedDB.
          This SSH CA is intended for demo purposes only and is not trusted by any SSH server by default.
        </Typography>
        <Box>
          <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flexGrow: 1 }} />
            <ButtonGroup variant="outlined" size="small" color="primary">
              <Tooltip title="Download SSH CA Public Key">
                <Button onClick={handleDownload} size="small">
                  <Download fontSize="small" />
                </Button>
              </Tooltip>
              <Tooltip title="Remove SSH CA">
                <Button onClick={handleRemove} size="small">
                  <DeleteForever fontSize="small" />
                </Button>
              </Tooltip>
            </ButtonGroup>
          </Box>

          {/* SSH CA Information */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" paragraph>SSH CA Information</Typography>
            <Typography variant="body2" paragraph>
              <strong>Name:</strong> {value?.name}
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Key Type:</strong> {value?.keyType}
            </Typography>
            {caFingerprint && (
              <Typography variant="body2" paragraph>
                <strong>Fingerprint:</strong> {caFingerprint}
              </Typography>
            )}
            <Typography variant="body2" paragraph>
              <strong>Public Key:</strong>
            </Typography>
            <TextField
              multiline
              fullWidth
              rows={3}
              value={value?.publicKey || ''}
              InputProps={{
                readOnly: true,
                style: { fontFamily: "Monaco, monospace", fontSize: "12px" },
              }}
            />
          </Box>
        </Box>
        <SshIssueCertificateView />
      </StateBox>
    </Paper>
  );
};
