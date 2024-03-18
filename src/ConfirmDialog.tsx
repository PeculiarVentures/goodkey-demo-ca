import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button
} from '@mui/material';
import * as React from 'react';
import { useApplicationContext } from "./AppProvider";

export const DLG_CONFIRM = 'confirm';

export interface ConfirmDialogProps {
  open: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ open }) => {
  const { dialog } = useApplicationContext();
  const { hideDialog } = useApplicationContext();

  const onClose = () => {
    hideDialog();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{dialog?.title}</DialogTitle>
      <DialogContent>
        {dialog?.content}
      </DialogContent>
      <DialogActions sx={{ mb: 1, mr: 1 }}>
        <Button
          variant='contained'
          onClick={() => {
            if (dialog?.onConfirm) {
              dialog.onConfirm();
            }
            onClose();
          }}>
          Confirm
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
