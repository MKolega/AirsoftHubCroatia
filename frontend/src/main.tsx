import { createRoot } from 'react-dom/client'
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import './index.css'
import 'leaflet/dist/leaflet.css';
import App from './App.tsx'
import { theme } from './theme';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <App />
  </ThemeProvider>
)
