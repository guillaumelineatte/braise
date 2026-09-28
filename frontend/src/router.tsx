import { createBrowserRouter, type RouteObject } from "react-router";
import PublicLayout from "./pages/PublicLayout";
import { RouteError } from "./pages/RouteError";

const Blank = () => null;

const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default });

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: "/dev/components", lazy: page(() => import("./dev/DevComponents")), HydrateFallback: Blank }]
  : [];

export const router = createBrowserRouter([
  {
    Component: PublicLayout,
    HydrateFallback: Blank,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import("./pages/Home")) },
      { path: "recettes", lazy: page(() => import("./pages/RecipeList")) },
      { path: "recettes/:slug", lazy: page(() => import("./pages/RecipePage")) },
      { path: "a-propos", lazy: page(() => import("./pages/About")) },
      { path: "*", lazy: page(() => import("./pages/NotFound")) },
    ],
  },
  { path: "/admin/login", lazy: page(() => import("./pages/admin/Login")), HydrateFallback: Blank, errorElement: <RouteError /> },
  {
    path: "/admin",
    lazy: page(() => import("./pages/admin/AdminLayout")),
    HydrateFallback: Blank,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: page(() => import("./pages/admin/Dashboard")) },
      { path: "recipes", lazy: page(() => import("./pages/admin/Recipes")) },
      { path: "recipes/:id", lazy: page(() => import("./pages/admin/Editor")) },
      { path: "categories", lazy: page(() => import("./pages/admin/Categories")) },
      { path: "*", lazy: page(() => import("./pages/NotFound")) },
    ],
  },
  ...devRoutes,
]);
