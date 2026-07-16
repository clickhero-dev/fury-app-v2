import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { ResetPasswordSuccessPage } from './pages/auth/ResetPasswordSuccessPage';
import { LandingPage } from './pages/landing/LandingPage';
import { ConectarMetaPage } from './pages/onboarding/ConectarMetaPage';
import { MetaAuthorizePage } from './pages/onboarding/MetaAuthorizePage';
import { MetasPage } from './pages/onboarding/MetasPage';
import { SelecionarAtivosPage } from './pages/onboarding/SelecionarAtivosPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireSuperadmin } from './components/auth/RequireSuperadmin';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthenticatedShell } from './components/layout/AuthenticatedShell';
import { AdminShell } from './components/layout/AdminShell';
import { Dashboard } from './pages/dashboard/Dashboard';
import { Metas } from './pages/dashboard/Metas';
import { PainelCampanhas } from './pages/campanhas/PainelCampanhas';
import { RegrasCampanhas } from './pages/campanhas/RegrasCampanhas';
import { InsightsCampanha } from './pages/campanhas/InsightsCampanha';
import { CreativeStudio } from './pages/estudio/CreativeStudio';
import { EstudioHome } from './pages/estudio/EstudioHome';
import { GeradorImagem } from './pages/estudio/GeradorImagem';
import { PlanejadorPage } from './pages/planejador/PlanejadorPage';
import { CalendarioPage } from './pages/planejador/CalendarioPage';
import { Configuracoes } from './pages/configuracoes/Configuracoes';
import { Integracoes } from './pages/configuracoes/Integracoes';
import { MinhasRegras } from './pages/automacao/MinhasRegras';
import { ComponentsDemo } from './pages/ComponentsDemo';
import { Plans } from './pages/billing/Plans';
import { Subscription } from './pages/billing/Subscription';
import { AssinaturaVencida } from './pages/billing/AssinaturaVencida';
import { OrcamentoSmart } from './pages/orcamento/OrcamentoSmart';
import { AdminLogin } from './pages/superadmin/AdminLogin';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminLayout } from './pages/superadmin/AdminLayout';
import { TenantsPage } from './pages/superadmin/TenantsPage';
import { TenantDetailPage } from './pages/superadmin/TenantDetailPage';
import { PlansPage } from './pages/superadmin/PlansPage';
import { UsersPage } from './pages/superadmin/UsersPage';
import { TenantCampaignsPage } from './pages/superadmin/TenantCampaignsPage';

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
 * - `/configuracoes/brand-kit` → identidade visual da organization
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
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/reset-password/success',
    element: <ResetPasswordSuccessPage />,
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
    path: '/l/:codigo',
    element: <LandingPage />,
  },
  {
    // Layout autenticado: todas as rotas filhas exigem login
    // AuthenticatedShell renderiza sidebar, header e o <Outlet /> das rotas filhas
    element: <AuthenticatedShell />,
    children: [
      { path: '/dashboard', element: <Dashboard /> },
      { path: '/onboarding/metas', element: <AppLayout><MetasPage /></AppLayout> },
      { path: '/dashboard/metas', element: <Metas /> },
      { path: '/campanhas', element: <PainelCampanhas /> },
      { path: '/campanhas/regras', element: <RegrasCampanhas /> },
      { path: '/campanhas/:id/insights', element: <InsightsCampanha /> },
      { path: '/automacao', element: <MinhasRegras /> },
      { path: '/automacao/minhas-regras', element: <MinhasRegras /> }, // alias
      { path: '/estudio-criativo', element: <CreativeStudio /> },
      { path: '/estudio', element: <EstudioHome /> },
      { path: '/estudio/imagem', element: <GeradorImagem /> },
      { path: '/planejador', element: <PlanejadorPage /> },
      { path: '/calendario', element: <CalendarioPage /> },
      { path: '/configuracoes', element: <Configuracoes /> },
      { path: '/configuracoes/integracoes', element: <Integracoes /> },
      { path: '/configuracoes/brand-kit', element: <Navigate to="/configuracoes?tab=publico" replace /> },
      { path: '/planos', element: <Plans /> },
      { path: '/assinatura', element: <Subscription /> },
      { path: '/orcamento-smart', element: <OrcamentoSmart /> },
      { path: '/components-demo', element: <ComponentsDemo /> },
      { path: '/assinatura-vencida', element: <AssinaturaVencida /> },
    ],
  },
  {
    path: '/assinatura-vencida',
    element: <AssinaturaVencida />,
  },
  {
    path: '/admin/login',
    element: <AdminLogin />,
  },
  {
    path: '/admin',
    element: (
      <RequireSuperadmin>
        <AdminShell />
      </RequireSuperadmin>
    ),
    children: [
      { index: true, element: <TenantsPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'tenants/:id', element: <TenantDetailPage /> },
      { path: 'tenants/:id/campaigns', element: <TenantCampaignsPage /> },
      { path: 'planos', element: <PlansPage /> },
    ],
  },
  // Catch-all: qualquer rota não definida acima exibe a página 404
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);