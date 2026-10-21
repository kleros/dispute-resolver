import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { browserColorSchemeMedia, browserLocalStorage, createColorSchemeStore } from "./theme";
import "./index.css";

// Created outside React so StrictMode's double render cannot create a second one, and before the first render so the
// first paint is already themed.
const colorScheme = createColorSchemeStore({ root: document.documentElement, media: browserColorSchemeMedia(), storage: browserLocalStorage() });

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <App colorScheme={colorScheme} />
  </StrictMode>,
);
