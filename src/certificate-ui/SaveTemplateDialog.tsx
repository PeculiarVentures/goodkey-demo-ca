import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import * as React from "react";
import {
  convertToRelativeValidity,
  type TemplateSaveOptions,
  type X509Configuration,
  type X509Template,
} from "../certificates";
import { errorMessage } from "./files";

interface Props {
  configuration: X509Configuration;
  existing?: X509Template;
  onClose(): void;
  onSave(name: string, config: X509Configuration, options: TemplateSaveOptions): void;
}

export function SaveTemplateDialog({ configuration, existing, onClose, onSave }: Props) {
  const [name, setName] = React.useState(existing?.name ?? "");
  const [includeSubject, setIncludeSubject] = React.useState(false);
  const [includeSan, setIncludeSan] = React.useState(false);
  const [convert, setConvert] = React.useState(false);
  const [error, setError] = React.useState("");
  let duration: number | undefined;
  try {
    const relative = convertToRelativeValidity(configuration);
    if (relative.validity.mode === "relative") duration = relative.validity.days;
  } catch {
    /* Validation is reported on save. */
  }
  const exact = configuration.validity.mode === "exact";
  const save = () => {
    try {
      onSave(name, exact ? convertToRelativeValidity(configuration) : configuration, {
        includeSubject,
        includeSan,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="save-template-title">
      <DialogTitle id="save-template-title">
        {existing ? "Save template changes" : "Save as template"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            autoFocus
            label="Template name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <Typography variant="body2">
            Templates stay in this browser. They store certificate settings, never keys, CSRs,
            issuer information, or generated fields.
          </Typography>
          <FormControlLabel
            label="Include subject"
            control={
              <Checkbox
                checked={includeSubject}
                onChange={(event) => setIncludeSubject(event.target.checked)}
              />
            }
          />
          <FormControlLabel
            label="Include subject alternative names (SAN)"
            control={
              <Checkbox
                checked={includeSan}
                onChange={(event) => setIncludeSan(event.target.checked)}
              />
            }
          />
          <Typography variant="caption">
            Identity fields are excluded by default. Applying a template that omits them preserves
            the current subject and SAN.
          </Typography>
          {existing &&
            (existing.settings.subject !== undefined || existing.settings.san !== undefined) && (
              <Alert severity="info">
                This template currently includes identity fields. Select the checkboxes above to
                retain them in this update.
              </Alert>
            )}
          {exact && (
            <Alert severity="info">
              <Typography variant="body2">
                Templates use a duration starting at issuance, not fixed dates. This range becomes{" "}
                {duration ?? "an invalid number of"} days.
              </Typography>
              <FormControlLabel
                label="Convert exact dates to this duration for the template"
                control={
                  <Checkbox
                    checked={convert}
                    onChange={(event) => setConvert(event.target.checked)}
                  />
                }
              />
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim() || (exact && !convert)} onClick={save}>
          {existing ? "Save changes" : "Save template"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
