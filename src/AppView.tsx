import { AppBar, Box, Container, CssBaseline, Divider, ThemeProvider, Toolbar, Typography, createTheme } from "@mui/material";
import * as React from 'react';

import { useApplicationContext } from "./AppProvider";
import { DialogLayout } from "./DialogLayout";
import { CaView } from "./CaView";
import { CaProvider } from "./CaProvider";
import { ThemeSwitcher } from "./ThemeSwitcher";

const drawerWidth = 0;

export interface ApplicationViewProps {
}

export const AppView: React.FC<ApplicationViewProps> = (props) => {
  const {
    darkMode,
  } = useApplicationContext();

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
    },
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex' }}>
        <AppBar
          position="fixed"
          sx={{ width: `calc(100% - ${drawerWidth}px)`, ml: `${drawerWidth}px` }}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              GoodKey Demo CA
            </Typography>
            <ThemeSwitcher />
            <Divider orientation="vertical" variant="middle" flexItem sx={{ mx: 2 }} />
          </Toolbar>
        </AppBar>
        <Container component="main" maxWidth="md" sx={{ mt: 10 }}>
          <CaProvider name="Demo CA">
            <CaView />
          </CaProvider>
        </Container>
      </Box>
      <DialogLayout />
    </ThemeProvider >
  );
};