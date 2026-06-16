import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import PolicyCreator from "./pages/PolicyCreator";
import Extractor from "./pages/Extractor";
import "./styles.css";

const router = createBrowserRouter([
  { path: "/", element: <PolicyCreator /> },
  { path: "/trusted-domain-extractor", element: <Extractor /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
