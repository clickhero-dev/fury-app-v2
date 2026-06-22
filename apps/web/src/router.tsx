import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ConectarMetaPage } from './pages/onboarding/ConectarMetaPage';
import { MetaAuthorizePage } from './pages/onboarding/MetaAuthorizePage';
import { MetasPage } from './pages/onboarding/MetasPage';
import { SelecionarAtivosPage } from './pages/onboarding/SelecionarAtivosPage';
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
import { BrandKitPage } from './pages/configuracoes/BrandKitPage';
import { MinhasRegras } from './pages/automacao/MinhasRegras';
import { ComponentsDemo } from './pages/ComponentsDemo';
import { Plans } from './pages/billing/Plans';
import { Subscription } from './pages/billing/Subscription';

/**
 * Roteador principal da aplicação FURY.
 * Utiliza React Router DOM v6 com createBrowserRouter.
 *
 * Estrutura de rotas:
 *
 * ## Rotas públicas (sem autenticação)
 * - `/` → redireciona para `/login`
 * - `/login` → página de login
 * - `/cadastro` → página de cadastro
 * - `/onboarding/conectar-meta` → início do fluxo de conexão com Meta
 * - `/onboarding/meta-authorize` → callback OAuth do Meta
 *
 * ## Rota protegida individual
 * - `/onboarding/selecionar-conta` → seleção de conta Meta (requer autenticação via ProtectedRoute)
 *
 * ## Rotas autenticadas (dentro do AuthenticatedShell)
 * Todas as rotas abaixo exigem autenticação e são renderizadas
 * dentro do layout principal com sidebar e header.
 *
 * ### Dashboard
 * - `/dashboard` → visão geral de métricas
 * - `/dashboard/metas` → progresso das metas mensais
 *
 * ### Onboarding (pós-login)
 * - `/onboarding/metas` → configuração inicial de metas
 *
 * ### Campanhas
 * - `/campanhas` → painel de campanhas
 * - `/campanhas/regras` → regras de automação por campanha
 * - `/campanhas/:id/insights` → insights detalhados de uma campanha específica
 *
 * ### Automação
 * - `/automacao` → lista de regras do FURY Engine
 * - `/automacao/minhas-regras` → alias para `/automacao`
 *
 * ### Estúdio Criativo
 * - `/estudio` → home do estúdio
 * - `/estudio-criativo` → estúdio completo
 * - `/estudio/imagem` → gerador de imagens com DALL-E 3
 *
 * ### Configurações
 * - `/configuracoes` → configurações gerais da conta
 * - `/configuracoes/integracoes` → conexões com Meta e outras integrações
 * - `/configuracoes/brand-kit` → identidade visual da organização
 *
 * ### Billing
 * - `/planos` → planos disponíveis
 * - `/assinatura` → gerenciamento da assinatura ativa
 *
 * ### Utilitários
 * - `/components-demo` → demonstração de componentes UI (uso interno/desenvolvimento)
 */
export const router = createBrowserRouter([
  {
    // Redireciona a raiz para o login
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
    // Início do fluxo OAuth Meta — não requer autenticação prévia
    path: '/onboarding/conectar-meta',
    element: <ConectarMetaPage />,
  },
  {
    // Callback OAuth do Meta após autorização
    path: '/onboarding/meta-authorize',
    element: <MetaAuthorizePage />,
  },
  {
    // Seleção de conta Meta — requer autenticação via ProtectedRoute
    path: '/onboarding/selecionar-conta',
    element: (
      <ProtectedRoute>
        <SelecionarAtivosPage />
      </ProtectedRoute>
    ),
  },
  {
    // Layout autenticado: todas as rotas filhas exigem login
    // AuthenticatedShell renderiza sidebar, header e o <Outlet /> das rotas filhas
    element: <AuthenticatedShell />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/onboarding/metas', element: <MetasPage /> },
      { path: '/dashboard/metas', element: <Metas /> },
      { path: '/campanhas', element: <PainelCampanhas /> },
      { path: '/campanhas/regras', element: <RegrasCampanhas /> },
      { path: '/campanhas/:id/insights', element: <InsightsCampanha /> },
      { path: '/automacao', element: <MinhasRegras /> },
      { path: '/automacao/minhas-regras', element: <MinhasRegras /> }, // alias
      { path: '/estudio-criativo', element: <CreativeStudio /> },
      { path: '/estudio', element: <EstudioHome /> },
      { path: '/estudio/imagem', element: <GeradorImagem /> },
      { path: '/configuracoes', element: <Configuracoes /> },
      { path: '/configuracoes/integracoes', element: <Integracoes /> },
      { path: '/configuracoes/brand-kit', element: <BrandKitPage /> },
      { path: '/planos', element: <Plans /> },
      { path: '/assinatura', element: <Subscription /> },
      { path: '/components-demo', element: <ComponentsDemo /> }, // uso interno
    ],
  },
]);