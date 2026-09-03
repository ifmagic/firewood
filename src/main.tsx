import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App.tsx';
import { installWKWebViewFocusShim } from './utils/wkWebViewFocusShim';

// Must run before any editor mounts: WKWebView (Safari 26 engine) ignores
// focus({preventScroll:true}), which makes CodeMirror scroll the old caret into
// view on click-after-scroll (viewport jumps back ~900 lines). See the shim module.
installWKWebViewFocusShim();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
