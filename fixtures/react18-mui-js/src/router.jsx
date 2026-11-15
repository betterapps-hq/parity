import { createBrowserRouter } from 'react-router'
import { projects } from './data/projects.js'
import { MarketingLayout } from './layouts/MarketingLayout.jsx'
import { ProjectsLayout } from './layouts/ProjectsLayout.jsx'
import { About } from './routes/About.jsx'
import { Docs } from './routes/Docs.jsx'
import { Home } from './routes/Home.jsx'
import { NotFound } from './routes/NotFound.jsx'
import { Pricing } from './routes/Pricing.jsx'
import { ProjectList } from './routes/ProjectList.jsx'
import { ProjectPage } from './routes/ProjectPage.jsx'

// React Router in library mode: route objects, with each of the ways to declare one.
export const router = createBrowserRouter([
  {
    // A layout without a path of its own: the marketing pages share its header.
    element: <MarketingLayout />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Home /> },
      { path: 'pricing', element: <Pricing /> },
      // An optional segment: /about and /fr/about.
      { path: ':lang?/about', element: <About /> },
    ],
  },
  {
    // A nested layout with its own path, drawing its children at its <Outlet>.
    path: 'projects',
    element: <ProjectsLayout />,
    children: [
      { index: true, element: <ProjectList />, loader: () => projects },
      {
        path: ':projectId',
        element: <ProjectPage />,
        loader: ({ params }) => projects.find((project) => project.id === params.projectId) ?? null,
      },
    ],
  },
  // A route whose module loads when it's first visited.
  { path: 'settings', lazy: () => import('./routes/Settings.jsx') },
  // A splat that takes the rest of the URL.
  { path: 'docs/*', element: <Docs /> },
  { path: '*', element: <NotFound /> },
])
