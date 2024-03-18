import * as React from 'react';
import { useSnackbar } from "notistack";

import { DLG_CONFIRM } from "./ConfirmDialog";

const lsDarkMode = 'darkMode';

export interface DialogProps {
  id: string;
  title?: string;
  params?: any;
  content?: React.ReactNode;
  onConfirm?: (...args: any[]) => void;
}

export interface DialogConfirmProps {
  title?: string;
  message: string | React.ReactNode;
  onConfirm: () => void;
}

export interface ApplicationContextProps {
  darkMode: boolean;
  setDarkMode: (darkMode: boolean) => void;
  error?: Error;
  setError: (error: Error) => void;
  setInfo: (info: string) => void;
  setWarning: (warning: string) => void;
  dialog?: DialogProps;
  showDialog: (params: DialogProps) => void;
  showConfirmDialog: (params: DialogConfirmProps) => void;
  hideDialog: () => void;
}

export const ApplicationContext = React.createContext<ApplicationContextProps | undefined>(undefined);

interface AppProviderProps {
  children: React.ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [error, setError] = React.useState<Error>();
  const [darkMode, setDarkMode] = React.useState(localStorage.getItem(lsDarkMode) === 'true');
  const [dialog, setDialog] = React.useState<DialogProps>();

  const context: ApplicationContextProps = {
    darkMode,
    setDarkMode: (darkMode: boolean) => {
      localStorage.setItem(lsDarkMode, darkMode ? 'true' : 'false');
      setDarkMode(darkMode);
    },
    error,
    setError: (error: Error) => {
      console.error(error);
      setError(error);
      enqueueSnackbar(error.message, {
        variant: 'error',
        anchorOrigin: {
          vertical: 'bottom',
          horizontal: 'right',
        },
      });
    },
    setInfo: (info: string) => {
      // enqueueSnackbar(info, {
      //   variant: 'success',
      //   anchorOrigin: {
      //     vertical: 'bottom',
      //     horizontal: 'right',
      //   },
      // });
    },
    setWarning: (warning: string) => {
      enqueueSnackbar(warning, {
        variant: 'warning',
        anchorOrigin: {
          vertical: 'bottom',
          horizontal: 'right',
        },
      });
    },
    dialog,
    showDialog: (params: DialogProps) => {
      setDialog(params);
    },
    showConfirmDialog: (params: DialogConfirmProps) => {
      setDialog({
        id: DLG_CONFIRM,
        title: params.title,
        content: params.message,
        onConfirm: params.onConfirm,
      });
    },
    hideDialog: () => {
      setDialog(undefined);
    },
  };

  return (
    <ApplicationContext.Provider value={context}>
      {children}
    </ApplicationContext.Provider>
  );
};

export const useApplicationContext = () => {
  const context = React.useContext(ApplicationContext);
  if (context === undefined) {
    throw new Error('useApplicationContext must be used within an AppProvider');
  }
  return context;
};
