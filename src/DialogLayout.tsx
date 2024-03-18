import * as React from 'react';
import { useApplicationContext } from "./AppProvider";
import { ConfirmDialog, DLG_CONFIRM } from "./ConfirmDialog";
import { CustomDialog, DLG_CUSTOM } from "./CustomDialog";

export const DialogLayout: React.FC = () => {
  const { dialog } = useApplicationContext();

  let content: React.ReactNode;
  switch (dialog?.id) {
    case DLG_CONFIRM:
      content = <ConfirmDialog open={true} />;
      break;
    case DLG_CUSTOM:
      content = <CustomDialog open={true} />;
      break;
    default:
      content = null;
      break;
  }

  return (
    <React.Fragment>
      {content}
    </React.Fragment>
  );
};