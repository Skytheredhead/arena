import ReactDOM from 'react-dom/client';
import App from './App';
import { CrashBoundary } from './app/CrashBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <CrashBoundary>
    <App />
  </CrashBoundary>
);
