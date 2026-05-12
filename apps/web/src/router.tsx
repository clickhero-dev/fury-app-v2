import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ConectarMetaPage } from './pages/onboarding/ConectarMetaPage';
import { MetaAuthorizePage } from './pages/onboarding/MetaAuthorizePage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Dashboard } from './pages/dashboard/Dashboard';
import { PainelCampanhas } from './pages/campanhas/PainelCampanhas';
import { RegrasCampanhas } from './pages/campanhas/RegrasCampanhas';
import { EstudioCriativo } from './pages/estudio-criativo/EstudioCriativo';
import { EstudioHome } from './pages/estudio/EstudioHome';
import { GeradorImagem } from './pages/estudio/GeradorImagem';
import { Configuracoes } from './pages/configuracoes/Configuracoes';
import { ComponentsDemo } from './pages/ComponentsDemo';

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
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Dashboard />
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
    path: '/estudio-criativo',
    element: (
      <ProtectedRoute>
        <EstudioCriativo />
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
    path: '/components-demo',
    element: (
      <ProtectedRoute>
        <ComponentsDemo />
      </ProtectedRoute>
    ),
  },
]);
