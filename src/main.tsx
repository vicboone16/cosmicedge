const TEST_REF = "xilxyiijgnadlbabytfn";
const LIVE_REF = "gwfgmlfggeyxexclwybk";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || "";

function extractRef(url: string) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "";
  }
}

const ref = extractRef(supabaseUrl);
const isPublished = window.location.hostname.includes("lovable.app");

if (isPublished && ref === TEST_REF) {
  document.body.innerHTML = `
    <div style="padding:40px;font-family:system-ui;">
      <h1 style="color:red;">🚨 ERROR: Published site is connected to TEST database.</h1>
      <p>Detected ref: ${ref}</p>
      <p>Expected LIVE ref: ${LIVE_REF}</p>
      <p>Fix environment variables before continuing.</p>
    </div>
  `;
  throw new Error("Published site pointing to TEST database");
}

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
