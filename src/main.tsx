import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MasterDataProvider } from "./context/MasterDataContext";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MasterDataProvider>
      <App />
    </MasterDataProvider>
  </StrictMode>
);
