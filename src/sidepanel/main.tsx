import React from "react";
import ReactDOM from "react-dom/client";
import { SidePanel } from "./SidePanel";
import "./styles/theme.css";
import "./styles/sidepanel.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found.");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
