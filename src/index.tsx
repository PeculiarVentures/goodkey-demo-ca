import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { SnackbarProvider } from "notistack";
import { AppProvider } from "./AppProvider";
import { CaView } from "./CaView";
import { CaProvider } from "./CaProvider";
import { AppView } from "./AppView";

const App = () => {
  return (
    <SnackbarProvider maxSnack={3}>
      <AppProvider>
        <AppView />
      </AppProvider>
    </SnackbarProvider>
  );
};

const container = document.getElementById('app');
if (!container) {
  throw new Error('No container \'#app\' found in document!');
}
const root = createRoot(container);
root.render(
  <App />,
);
