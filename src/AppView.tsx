import { AppBar, Box, Container, CssBaseline, Divider, Tab, Tabs, ThemeProvider, Toolbar, Typography, createTheme } from "@mui/material";
import * as React from 'react';

import { useApplicationContext } from "./AppProvider";
import { DialogLayout } from "./DialogLayout";
import { CaView } from "./CaView";
import { CaProvider } from "./CaProvider";
import { SshView } from "./SshView";
import { SshProvider } from "./SshProvider";
import { ThemeSwitcher } from "./ThemeSwitcher";

const drawerWidth = 0;

export interface ApplicationViewProps {
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export const AppView: React.FC<ApplicationViewProps> = (props) => {
  const {
    darkMode,
  } = useApplicationContext();
  const [tabValue, setTabValue] = React.useState(0);

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
    },
  });

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

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
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange} aria-label="CA type tabs">
              <Tab label="X.509 CA" />
              <Tab label="SSH CA" />
            </Tabs>
          </Box>

          <TabPanel value={tabValue} index={0}>
            <CaProvider name="Demo CA">
              <CaView />
            </CaProvider>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <SshProvider name="Demo SSH CA">
              <SshView />
            </SshProvider>
          </TabPanel>
        </Container>
      </Box>
      <DialogLayout />
    </ThemeProvider >
  );
};