import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ConectarMetaPage } from './pages/onboarding/ConectarMetaPage';
import { MetaAuthorizePage } from './pages/onboarding/MetaAuthorizePage';
import { MetasPage } from './pages/onboarding/MetasPage';
import { ProtectedRoute } from './components/ProtectedRoute';
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
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/dashboard/metas',
    element: (
      <ProtectedRoute>
        <Metas />
      </ProtectedRoute>
    ),
  },
  {
    path: '/campanhas',
    element: (
      <ProtectedRoute>
        <PainelCampanhas />
      </ProtectedRoute>
    ),
  },
  {
    path: '/campanhas/regras',
    element: (
      <ProtectedRoute>
        <RegrasCampanhas />
      </ProtectedRoute>
    ),
  },
  {
    path: '/campanhas/:id/insights',
    element: (
      <ProtectedRoute>
        <InsightsCampanha />
      </ProtectedRoute>
    ),
  },
  {
    path: '/automacao',
    element: (
      <ProtectedRoute>
        <MinhasRegras />
      </ProtectedRoute>
    ),
  },
  {
    path: '/automacao/minhas-regras',
    element: (
      <ProtectedRoute>
        <MinhasRegras />
      </ProtectedRoute>
    ),
  },
  {
    path: '/estudio-criativo',
    element: (
      <ProtectedRoute>
        <CreativeStudio />
      </ProtectedRoute>
    ),
  },
  {
    path: '/estudio',
    element: (
      <ProtectedRoute>
        <EstudioHome />
      </ProtectedRoute>
    ),
  },
  {
    path: '/estudio/imagem',
    element: (
      <ProtectedRoute>
        <GeradorImagem />
      </ProtectedRoute>
    ),
  },
  {
    path: '/configuracoes',
    element: (
      <ProtectedRoute>
        <Configuracoes />
      </ProtectedRoute>
    ),
  },
  {
    path: '/configuracoes/integracoes',
    element: (
      <ProtectedRoute>
        <Integracoes />
      </ProtectedRoute>
    ),
  },
  {
    path: '/planos',
    element: (
      <ProtectedRoute>
        <Plans />
      </ProtectedRoute>
    ),
  },
  {
    path: '/assinatura',
    element: (
      <ProtectedRoute>
        <Subscription />
      </ProtectedRoute>
    ),
  },
  {
    path: '/components-demo',
    element: (
      <ProtectedRoute>
        <ComponentsDemo />
      </ProtectedRoute>
    ),
  },
]);
