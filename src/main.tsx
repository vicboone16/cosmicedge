import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.PROD) {
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateServiceWorker(true);
    },
  });
}

createRoot(document.getElementById("root")!).render(<App />);

