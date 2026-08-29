import type { ReactElement } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { IngestionPage } from "@/features/ingestion/IngestionPage";
import { KnowledgePage } from "@/features/knowledge/KnowledgePage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { AskPage } from "@/features/query/AskPage";
import { TopicsPage } from "@/features/topics/TopicsPage";
import { AnomaliesPage } from "@/features/anomalies/AnomaliesPage";
import { ValidationPage } from "@/features/validation/ValidationPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { PlaceholderPage } from "@/features/PlaceholderPage";
import { NAV } from "@/app/nav";

const BUILT: Record<string, ReactElement> = {
  "/ingestion": <IngestionPage />,
  "/knowledge": <KnowledgePage />,
  "/reports": <ReportsPage />,
  "/query": <AskPage />,
  "/topics": <TopicsPage />,
  "/anomalies": <AnomaliesPage />,
  "/validation": <ValidationPage />,
  "/admin": <AdminPage />,
};

const featureRoutes = NAV.filter((n) => n.to !== "/").map((n) => ({
  path: n.to,
  element: BUILT[n.to] ?? (
    <PlaceholderPage title={n.label} blurb={n.blurb} milestone={n.milestone} />
  ),
}));

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      ...featureRoutes,
      { path: "*", element: <PlaceholderPage title="Not found" blurb="No such page." milestone="—" /> },
    ],
  },
]);
