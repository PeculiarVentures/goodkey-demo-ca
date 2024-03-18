import { Box, Switch } from "@mui/material";
import { Brightness7, Brightness3 } from "@mui/icons-material";
import * as React from 'react';

import { useApplicationContext } from "./AppProvider";

export interface ThemeSwitcherProps { }

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = () => {
  const { darkMode, setDarkMode } = useApplicationContext();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
      }}>
      {/* Icon on light */}
      <Brightness7 />
      <Switch
        checked={darkMode}
        onChange={() => {
          setDarkMode(!darkMode);
        }}
      />
      <Brightness3 />
    </Box>
  );
};
