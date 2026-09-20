import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./style.css";
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    const button = document.createElement("button");
    button.className = "update-banner";
    button.textContent = "有新版本・更新帳本";
    button.onclick = () => {
      if (
        confirm(
          "更新會重新開啟網站。已儲存的帳目會保留；請先完成尚未送出的表單。現在更新？",
        )
      )
        void updateSW(true);
    };
    document.body.appendChild(button);
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
