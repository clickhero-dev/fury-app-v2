import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ConectarMetaPage } from './pages/onboarding/ConectarMetaPage';
import { MetaAuthorizePage } from './pages/onboarding/MetaAuthorizePage';
import { MetasPage } from './pages/onboarding/MetasPage';
import { SelecionarContaPage } from './pages/onboarding/SelecionarContaPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthenticatedShell } from './components/layout/AuthenticatedShell';
import { Dashboard } from './pages/dashboard/Dashboard';
import { Metas } from './pages/dashboard/Metas';
import { PainelCampanhas } from './pages/campanhas/PainelCampanhas';
import { RegrasCampanhas } from './pages/campanhas/RegrasCampanhas';
import { InsightsCampanha } from './pages/campanhas/InsightsCampanha';
import { CreativeStudio } from './pages/estudio/CreativeStudio';
import { EstudioHome } from './pages/estudio/EstudioHome';
import { GeradorImagem } from './pages/estudio/GeradorImagem';
import { Configuracoes } from './pages/configuracoes/Configuracoes';
import { Integracoes } from './pages/configuracoes/Integracoes';
import { MinhasRegras } from './pages/automacao/MinhasRegras';
import { ComponentsDemo } from './pages/ComponentsDemo';
import { Plans } from './pages/billing/Plans';
import { Subscription } from './pages/billing/Subscription';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/cadastro',
    element: <RegisterPage />,
  },
  {
    path: '/onboarding/conectar-meta',
    element: <ConectarMetaPage />,
  },
  {
    path: '/onboarding/meta-authorize',
    element: <MetaAuthorizePage />,
  },
  {
    path: '/onboarding/metas',
    element: (
      <ProtectedRoute>
        <MetasPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/onboarding/selecionar-conta',
    element: (
      <ProtectedRoute>
        <SelecionarContaPage />
      </ProtectedRoute>
    ),
  },
  {
    element: <AuthenticatedShell />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/dashboard/metas', element: <Metas /> },
      { path: '/campanhas', element: <PainelCampanhas /> },
      { path: '/campanhas/regras', element: <RegrasCampanhas /> },
      { path: '/campanhas/:id/insights', element: <InsightsCampanha /> },
      { path: '/automacao', element: <MinhasRegras /> },
      { path: '/automacao/minhas-regras', element: <MinhasRegras /> },
      { path: '/estudio-criativo', element: <CreativeStudio /> },
      { path: '/estudio', element: <EstudioHome /> },
      { path: '/estudio/imagem', element: <GeradorImagem /> },
      { path: '/configuracoes', element: <Configuracoes /> },
      { path: '/configuracoes/integracoes', element: <Integracoes /> },
      { path: '/planos', element: <Plans /> },
      { path: '/assinatura', element: <Subscription /> },
      { path: '/components-demo', element: <ComponentsDemo /> },
    ],
  },
]);
