import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { registerSW } from "virtual:pwa-register";

// Auto-update SW: precached статика + тихое обновление при выходе новой версии.
// В dev отключено (devOptions.enabled=false в vite.config).
if (!import.meta.env.DEV) {
  registerSW({ immediate: true });
}

// Shim the async key-value API used by the app to localStorage.
// Keeps App.jsx identical to the PRD reference (`window.storage.get/set`).
window.storage = {
  get: async (key) => {
    const v = localStorage.getItem(key);
    return v == null ? null : { value: v };
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
