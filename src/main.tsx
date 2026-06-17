import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import PolicyCreator from "./pages/PolicyCreator";
import "./styles.css";

// The extractor pulls in SheetJS; load it only when its route is visited so the
// Policy Creator's initial bundle stays small.
const Extractor = lazy(() => import("./pages/Extractor"));

const router = createBrowserRouter(
  [
    { path: "/", element: <PolicyCreator /> },
    {
      path: "/trusted-domain-extractor",
      element: (
        <Suspense fallback={null}>
          <Extractor />
        </Suspense>
      ),
    },
  ],
  { future: { v7_relativeSplatPath: true } },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </StrictMode>,
);
