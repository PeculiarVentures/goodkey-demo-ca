import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import * as React from "react";
import { type CertificateTemplateStore, type X509Template } from "../certificates";
import { downloadFile, errorMessage, readFile } from "./files";

interface Props {
  store?: CertificateTemplateStore;
  templates: X509Template[];
  onChanged(): void;
  onClose(): void;
}

export function TemplateManager({ store, templates, onChanged, onClose }: Props) {
  const [selected, setSelected] = React.useState(templates[0]?.id ?? "");
  const current = templates.find((item) => item.id === selected);
  const [name, setName] = React.useState(current?.name ?? "");
  const [json, setJson] = React.useState("");
  const [collision, setCollision] = React.useState<"reject" | "replace" | "copy">("reject");
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [readingFile, setReadingFile] = React.useState(false);
  const fileVersion = React.useRef(0);
  React.useEffect(
    () => () => {
      fileVersion.current++;
    },
    [],
  );
  const run = (operation: (storage: CertificateTemplateStore) => void, message: string) => {
    setError("");
    setStatus("");
    try {
      if (!store)
        throw new Error("Local templates are unavailable because browser storage is disabled.");
      operation(store);
      onChanged();
      setStatus(message);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const upload = async (file: File) => {
    const version = ++fileVersion.current;
    setJson("");
    setReadingFile(true);
    setError("");
    setStatus("");
    try {
      if (file.size > 1_048_576) throw new Error("Template file must not exceed 1 MiB.");
      const contents = new TextDecoder().decode(await readFile(file));
      if (version === fileVersion.current) setJson(contents);
    } catch (cause) {
      if (version === fileVersion.current) setError(errorMessage(cause));
    } finally {
      if (version === fileVersion.current) setReadingFile(false);
    }
  };
  const copyJson = async () => {
    setError("");
    setStatus("");
    try {
      if (!store)
        throw new Error("Local templates are unavailable because browser storage is disabled.");
      await navigator.clipboard.writeText(store.export());
      setStatus("Template JSON copied.");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="manage-templates-title">
      <DialogTitle id="manage-templates-title">Manage local templates</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">
            Templates are stored only in this browser. Export a JSON file to back them up or move
            them to another browser. Built-in presets are immutable; use Save a copy to create your
            own.
          </Typography>
          {templates.length ? (
            <>
              <TextField
                select
                label="My template"
                value={current ? selected : ""}
                onChange={(event) => {
                  const item = templates.find((template) => template.id === event.target.value);
                  setSelected(event.target.value);
                  setName(item?.name ?? "");
                  setConfirmDelete(false);
                }}
              >
                <MenuItem value="" disabled>
                  Select a template
                </MenuItem>
                {templates.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
              {current && (
                <>
                  <TextField
                    label="Rename template"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    <Button
                      onClick={() =>
                        run((storage) => {
                          storage.rename(current.id, name);
                        }, "Template renamed.")
                      }
                    >
                      Rename
                    </Button>
                    <Button
                      onClick={() =>
                        run((storage) => {
                          storage.duplicate(current.id);
                        }, "Template copied.")
                      }
                    >
                      Duplicate
                    </Button>
                    <Button
                      onClick={() =>
                        run(
                          (storage) =>
                            downloadFile(
                              storage.export([current.id]),
                              `${current.name.replace(/[^a-z\d_-]/gi, "_")}.json`,
                              "application/json",
                            ),
                          "Template exported.",
                        )
                      }
                    >
                      Export selected
                    </Button>
                    <Button color="error" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </Button>
                  </Box>
                  {confirmDelete && (
                    <Alert severity="warning">
                      Delete “{current.name}” from this browser?{" "}
                      <Button
                        color="error"
                        onClick={() =>
                          run((storage) => {
                            storage.delete(current.id);
                            setSelected("");
                            setConfirmDelete(false);
                          }, "Template deleted.")
                        }
                      >
                        Confirm delete
                      </Button>
                      <Button onClick={() => setConfirmDelete(false)}>Cancel delete</Button>
                    </Alert>
                  )}
                </>
              )}
            </>
          ) : (
            <Typography color="text.secondary">No local templates yet.</Typography>
          )}
          <Button
            sx={{ alignSelf: "flex-start" }}
            onClick={() =>
              run(
                (storage) =>
                  downloadFile(
                    storage.export(),
                    "goodkey-certificate-templates.json",
                    "application/json",
                  ),
                "Templates exported.",
              )
            }
          >
            Export all templates
          </Button>
          <Button sx={{ alignSelf: "flex-start" }} onClick={() => void copyJson()}>
            Copy all template JSON
          </Button>
          <Divider />
          <Typography variant="subtitle1">Import templates</Typography>
          <Button component="label" sx={{ alignSelf: "flex-start" }}>
            Choose JSON file
            <input
              aria-label="Upload template JSON"
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
          </Button>
          <TextField
            label="Template JSON"
            multiline
            minRows={4}
            maxRows={8}
            value={json}
            onChange={(event) => {
              fileVersion.current++;
              setReadingFile(false);
              setJson(event.target.value);
              setStatus("");
              setError("");
            }}
          />
          <TextField
            select
            label="If a template ID already exists"
            value={collision}
            onChange={(event) => setCollision(event.target.value as typeof collision)}
          >
            <MenuItem value="reject">Keep existing and stop import</MenuItem>
            <MenuItem value="copy">Import as a new copy</MenuItem>
            <MenuItem value="replace">Replace existing templates with matching IDs</MenuItem>
          </TextField>
          {collision === "replace" && (
            <Alert severity="warning">
              Import will replace settings for matching template IDs. Other local templates are
              kept.
            </Alert>
          )}
          <Button
            variant="outlined"
            disabled={readingFile || !json.trim()}
            sx={{ alignSelf: "flex-start" }}
            onClick={() =>
              run((storage) => {
                storage.import(json, collision);
              }, "Templates imported successfully.")
            }
          >
            Import JSON
          </Button>
          {error && <Alert severity="error">{error}</Alert>}
          {status && <Alert severity="success">{status}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
