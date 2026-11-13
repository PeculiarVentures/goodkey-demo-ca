import {
  Box,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  ButtonGroup,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import * as React from "react";
import { DeleteForever, Download, ExpandMore } from "@mui/icons-material";

import { useCaContext } from "./CaProvider";
import { CertificateDetails } from "./CertificateDetails";
import { CaIssueCertificateView } from "./CaIssueCertificateView";
import { useApplicationContext } from "./AppProvider";

export interface CaViewProps {}

interface StateBoxParams {
  state: number;
  value: number;
  children: React.ReactNode;
}

const StateBox: React.FC<StateBoxParams> = ({ state, value, children }) => {
  return state === value ? <>{children}</> : null;
};

export const CaView: React.FC<CaViewProps> = () => {
  const { showConfirmDialog } = useApplicationContext();
  const { value, initialize, download, remove } = useCaContext();
  const [caName, setCaName] = React.useState<string>("CN=Demo CA, O=GoodKey, C=US");
  const [keyAlgorithm, setKeyAlgorithm] = React.useState<string>("rsa2048");

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
      title: "Remove CA",
      message: "Are you sure you want to remove this CA?",
      onConfirm: () => {
        remove();
      },
    });
  };

  const handleDownload = () => {
    download();
  };

  const state = value ? 2 : 1;
  const caCert = value?.cert || "";

  return (
    <Paper elevation={0} sx={{ p: { xs: 1, sm: 3 } }}>
      {/* Initialize CA */}
      <StateBox state={state} value={1}>
        <Typography variant="h6" component="p" sx={{ mb: 2 }}>
          Initialize CA
        </Typography>
        <Typography variant="body2" component="p" sx={{ mb: 2 }}>
          A Demo CA has not been created yet. You can create one here. Keys and certificates will be
          stored in the browser's IndexedDB.
        </Typography>
        <Typography variant="body2" component="p" sx={{ mb: 2 }}>
          Please specify the certificate name and key algorithm for the CA (eg CN=Demo CA,
          O=GoodKey, C=US).
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            variant="outlined"
            margin="normal"
            fullWidth
            label="Certificate Name"
            value={caName}
            onChange={handleCaNameChange}
            size="small"
          />
          <FormControl fullWidth>
            <InputLabel id="key-algorithm-label">Key Algorithm</InputLabel>
            <Select
              labelId="key-algorithm-label"
              label="Key Algorithm"
              value={keyAlgorithm}
              onChange={handleAlgorithmChange}
              size="small"
            >
              <MenuItem value="rsa2048">RSA 2048</MenuItem>
              <MenuItem value="rsa4096">RSA 4096</MenuItem>
              <MenuItem value="ecp256">EC P-256</MenuItem>
              <MenuItem value="ecp384">EC P-384</MenuItem>
              <MenuItem value="ecp521">EC P-521</MenuItem>
            </Select>
          </FormControl>
        </Box>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          sx={{ mt: 2 }}
          onClick={handleInitialize}
        >
          Initialize
        </Button>
      </StateBox>
      {/* CA initialized */}
      <StateBox state={state} value={2}>
        <Accordion
          disableGutters
          elevation={0}
          sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="body2">
              <strong>Issuer: {value?.name}</strong> · Browser-local demo CA
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The CA private key and certificate stay in this browser's IndexedDB. This demo CA is
              not trusted by browsers or operating systems.
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Box sx={{ flexGrow: 1 }} />
              <ButtonGroup variant="outlined" size="small" color="primary">
                <Tooltip title="Download CA Certificate">
                  <Button
                    onClick={handleDownload}
                    size="small"
                    aria-label="Download CA certificate"
                  >
                    <Download fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="Remove CA">
                  <Button onClick={handleRemove} size="small" aria-label="Remove CA">
                    <DeleteForever fontSize="small" />
                  </Button>
                </Tooltip>
              </ButtonGroup>
            </Box>
            <CertificateDetails certificate={caCert} />
          </AccordionDetails>
        </Accordion>
        <CaIssueCertificateView />
      </StateBox>
    </Paper>
  );
};
