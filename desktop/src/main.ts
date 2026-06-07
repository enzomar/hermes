import { startApp } from "./app/app";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Missing application root");
}

startApp(root);