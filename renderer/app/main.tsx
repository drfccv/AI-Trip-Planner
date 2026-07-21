import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../app/page";
import { DesktopTitleBar } from "./title-bar";
import "../../app/globals.css";
import "./title-bar.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="desktop-shell">
      <DesktopTitleBar />
      <div className="desktop-content"><App /></div>
    </div>
  </React.StrictMode>,
);
