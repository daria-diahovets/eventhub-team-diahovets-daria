import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Не знайдено елемент #root у index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
