import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installDeviceAccessFetchInterceptor } from './utils/deviceAccess';
import { installAuthFetchInterceptor } from './utils/apiFetchInterceptor';

installDeviceAccessFetchInterceptor();
installAuthFetchInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
