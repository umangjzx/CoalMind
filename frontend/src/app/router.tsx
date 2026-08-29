import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { PlaceholderPage } from "@/features/PlaceholderPage";
import { NAV } from "@/app/nav";

const placeholders = NAV.filter((n) => n.to !== "/").map((n) => ({
  path: n.to,
  element: <PlaceholderPage title={n.label} blurb={n.blurb} milestone={n.milestone} />,
}));

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      ...placeholders,
      { path: "*", element: <PlaceholderPage title="Not found" blurb="No such page." milestone="—" /> },
    ],
  },
]);
