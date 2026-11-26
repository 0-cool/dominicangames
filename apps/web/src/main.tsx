import '@fontsource-variable/inter';
import '@fontsource/anton';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.tsx';
import { useAuth } from './lib/auth.ts';
import { installErrorReporting } from './lib/telemetry.ts';

installErrorReporting();
void useAuth.getState().refresh();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
