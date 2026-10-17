import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyColorScheme } from "./theme";
import "./index.css";

const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
applyColorScheme(document.documentElement, colorScheme.matches);
colorScheme.addEventListener("change", (event) => {
  applyColorScheme(document.documentElement, event.matches);
});

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
