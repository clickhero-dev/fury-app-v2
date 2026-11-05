-- Migration 0037: Policy de uso — tabelas de versionamento e aceite (feature politicas-de-uso)

CREATE TABLE IF NOT EXISTS "policy_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "version" varchar(50) NOT NULL,
  "content" text NOT NULL,
  "effective_from" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policy_versions_version_idx" ON "policy_versions" ("version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policy_versions_created_at_idx" ON "policy_versions" ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policy_acceptances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "policy_version_id" uuid NOT NULL REFERENCES "policy_versions"("id") ON DELETE RESTRICT,
  "accepted_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "policy_acceptances_user_version_unique" UNIQUE ("user_id", "policy_version_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policy_acceptances_tenant_id_idx" ON "policy_acceptances" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "policy_acceptances_user_id_idx" ON "policy_acceptances" ("user_id");
--> statement-breakpoint
-- RLS no padrão do projeto (enable_rls.sql): tenant isolation via app.current_tenant_id
ALTER TABLE "policy_acceptances" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY policy_acceptances_tenant_isolation ON policy_acceptances
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
--> statement-breakpoint
-- Seed v1.0 — texto de docs/politicas-de-uso-ady.txt (sem as notas internas)
INSERT INTO "policy_versions" ("version", "content")
SELECT '1.0', '================================================================================
                        POLÍTICAS DE USO — ADY
================================================================================

Versão: 1.0
Vigência a partir de: 10/09/2026

Este documento descreve as regras de uso do Ady, incluindo reembolso,
privacidade, telemetria, tratamento de dados e compartilhamento. Ao usar o
Ady, você concorda com estas políticas. Revisado continuamente conforme o
produto evolui.


--------------------------------------------------------------------------------
1. REEMBOLSO E CANCELAMENTO
--------------------------------------------------------------------------------

• Planos de assinatura são cobrados com recorrência (mensal ou anual),
  processados pelo gateway de pagamento (Asaas).

• O usuário pode cancelar a assinatura a qualquer momento. O cancelamento
  encerra a renovação automática; o acesso permanece ativo até o fim do ciclo
  já pago.

• DIREITO DE ARREPENDIMENTO: conforme o Código de Defesa do Consumidor
  (Art. 49), o usuário que contratar qualquer plano tem direito a desistir
  da contratação em até 7 (sete) dias corridos a partir da data da
  assinatura, sem necessidade de justificativa. Nesse caso, o reembolso do
  valor pago é integral e incondicional, processado em até [DEFINIR PRAZO]
  dias úteis pelo mesmo meio de pagamento utilizado.

• Esse direito de arrependimento é distinto do reembolso por análise descrito
  abaixo, que trata de situações posteriores ao prazo de 7 dias.

• REEMBOLSO (fora do prazo de arrependimento): solicitamos reembolso apenas
  em situações específicas e mediante análise individual, como:
    - cobrança duplicada ou incorreta por falha do sistema;
    - indisponibilidade prolongada do serviço sem comunicação prévia.
  Pedidos de reembolso devem ser encaminhados ao suporte em até 7 (sete) dias
  corridos após a cobrança, com a justificativa. A análise é feita caso a caso
  e a resposta é enviada por e-mail.

• Valores pagos em ciclos anteriores não são reembolsados pelo simples
  desuso parcial do serviço no período.

• Em caso de cobrança recusada por falta de crédito ou cartão expirado, o
  sistema pode tentar novamente e notificar o usuário. A recorrência de falhas
  pode levar à suspensão temporária até a regularização.

• Contestações (chargeback) seguem o fluxo do gateway e podem resultar na
  interrupção imediata do acesso enquanto a disputa é analisada.


--------------------------------------------------------------------------------
2. TELEMETRIA E LOGS ANÔNIMOS DE MELHORIA
--------------------------------------------------------------------------------

• O Ady coleta dados de telemetria e logs de uso com a finalidade de melhorar
  o produto, corrigir erros e acompanhar desempenho.

• Esses dados são ANÔNIMOS sempre que possível e não identificam você
  diretamente. Exemplos:
    - tipo de navegador e sistema operacional;
    - páginas e funcionalidades acessadas (sem conteúdo sensível);
    - tempo de resposta e erros encontrados;
    - ações agregadas de uso (número de clicks, recursos mais utilizados).

• NÃO coletamos por telemetria: conteúdo das suas campanhas, textos, prompts,
  imagens geradas, dados de cartão ou informações de pagamento.

• META PIXEL: o site do Ady utiliza o Meta Pixel para fins de remarketing,
  mesmo para visitantes que ainda não criaram conta. Essa coleta só ocorre
  mediante consentimento no banner de cookies e pode ser recusada a
  qualquer momento na opção "Rejeitar" ou "Somente essenciais", conforme
  descrito abaixo.

• A coleta de telemetria segue as preferências de consentimento de cookies
  que você seleciona no banner de privacidade:
    - "Aceitar tudo": habilita telemetria e análises complementares;
    - "Somente essenciais": mantém apenas o funcionamento básico, sem
      telemetria adicional;
    - "Rejeitar": desativa cookies e telemetria não essenciais.
  Você pode alterar essa escolha a qualquer momento.

• Os dados de telemetria são agregados e utilizados internamente para decisões
  de produto; não são usados para publicidade direcionada.


--------------------------------------------------------------------------------
3. DADOS QUE COLETAMOS E TRATAMOS
--------------------------------------------------------------------------------

Para que o Ady funcione, tratamos os seguintes dados — distintos dos dados de
telemetria descritos na seção 2:

• Dados de identificação e cadastro: nome, e-mail, telefone e dados da
  empresa (senha armazenada apenas em forma de hash).

• Credenciais de integração (OAuth): tokens de acesso ao Meta/Facebook e ao
  Google, incluindo token de atualização (refresh). Esses tokens são
  criptografados em repouso (AES-256-GCM) e usados somente para executar as
  integrações que você autorizou.

• Dados da conta de anúncios conectada: identificadores e seleções de contas
  de anúncio, business managers e páginas (Meta/Instagram e Google).

• Informações sobre o seu negócio: objetivo, nicho, produto principal,
  orçamento mensal, logotipo, cores da marca, tom de voz, fotos e contatos
  (ex.: WhatsApp) fornecidos para personalizar campanhas.

• Conteúdo gerado ou processado pela plataforma: textos, imagens, vídeos,
  prompts enviados à IA, campanhas criadas e seu histórico de desempenho
  (métricas, legendas, hashtags, calendário e status de publicação).

• Biblioteca de mídia: imagens e vídeos gerados ou enviados por você,
  incluindo status de conformidade.

• Dados de perfil comercial (Google Meu Negócio, quando conectado):
  endereço, telefone, e-mail, site, horários e fotos do estabelecimento.

• Mensagens trocadas pelo WhatsApp quando essa integração é utilizada para
  configurar ou operar campanhas.

• Dados de pagamento necessários à cobrança (processados pelo gateway, que
  tokeniza o cartão; não armazenamos os dados completos do cartão).

• Registros de uso (logs): IP, navegador, cabeçalhos e corpo de requisições,
  utilizados para diagnóstico, segurança e auditoria.

• Esses dados são tratados com a finalidade de prestar o serviço contratado
  e não são utilizados para fins de publicidade direcionada a terceiros.


--------------------------------------------------------------------------------
4. COMPARTILHAMENTO DE DADOS COM TERCEIROS
--------------------------------------------------------------------------------

• O Ady NÃO vende dados pessoais a terceiros.

• Compartilhamos dados apenas com prestadores de serviço estritamente
  necessários ao funcionamento da plataforma, sob obrigações de
  confidencialidade, como:
    - processador de pagamento (Asaas), para processar cobranças e
      assinaturas — recebe apenas os dados financeiros necessários;
    - provedores de infraestrutura e hospedagem;
    - provedores de inteligência artificial utilizados para geração de
      texto, imagem e análise de conteúdo, que recebem os dados
      estritamente necessários para executar a solicitação (ex.: prompt,
      briefing da marca, dados da campanha);
    - ferramentas de análise e monitoramento (apenas quando o consentimento
      de cookies permitir).

• TRANSFERÊNCIA INTERNACIONAL DE DADOS: alguns dos prestadores de serviço
  acima estão localizados fora do Brasil. O Ady utiliza provedores de
  inteligência artificial e serviços de nuvem localizados no exterior;
  parte dos dados necessários ao funcionamento da plataforma (ex.: textos,
  prompts, imagens de referência e métricas de campanha) pode, portanto,
  ser processada fora do Brasil. Nesses casos, o tratamento de dados
  pessoais ocorre em conformidade com o Art. 33 da LGPD, mediante garantias
  contratuais e técnicas de proteção equivalentes às exigidas pela legislação
  brasileira. Provedores envolvidos e respectivas localizações:

    - Anthropic (Claude) — Estados Unidos;
    - OpenRouter (agregador de modelos) — Estados Unidos;
    - DeepSeek (modelo de linguagem) — China;
    - Google (modelos e serviços Google Cloud) — Estados Unidos.

  Ao utilizar funcionalidades que dependem desses provedores (como geração de
  conteúdo por IA), você concorda com essa transferência.

• Integrações que você ativa por conta própria (ex.: Google Meu Negócio,
  Meta/Instagram, Google Ads) recebem somente os dados necessários para aquela
  integração funcionar, sob as políticas de cada plataforma.

• Poderemos compartilhar dados de forma agregada/estatística (não identificável)
  para fins de melhoria e relatórios.

• Cumprimos obrigações legais: dados podem ser compartilhados quando houver
  determinação legal, ordem judicial ou para proteção de direitos e segurança.


--------------------------------------------------------------------------------
5. DADOS PESSOAIS E LGPD
--------------------------------------------------------------------------------

• Tratamos dados pessoais conforme a Lei Geral de Proteção de Dados
  (Lei nº 13.709/2018 — LGPD).

• Retemos apenas os dados necessários para cada finalidade. Dados de pagamento
  sensíveis (cartão) são tokenizados pelo gateway e não ficam armazenados
  integralmente em nossos sistemas.

• RETENÇÃO E EXCLUSÃO: após o cancelamento da assinatura ou solicitação de
  exclusão de conta, os dados pessoais são mantidos pelo prazo de
  [DEFINIR PRAZO — ex.: 90 dias] para fins de suporte, cumprimento de
  obrigação legal ou fiscal, e então excluídos ou anonimizados, exceto os
  dados que a legislação exija manter por prazo maior (ex.: dados fiscais
  de cobrança).

• Você tem direito a: confirmar o tratamento, acessar, corrigir, anonimizar,
  portar e excluir seus dados, além de revogar consentimento — mediante
  solicitação ao suporte.

• Para exercer direitos de titular (acesso, correção, exclusão) ou fazer
  perguntas sobre privacidade, entre em contato pelo canal de suporte.


--------------------------------------------------------------------------------
6. USO ACEITÁVEL
--------------------------------------------------------------------------------

• O Ady é destinado a maiores de 18 anos ou a representantes legalmente
  autorizados de pessoa jurídica. Ao criar uma conta, você declara possuir
  capacidade legal para contratar em nome próprio ou da empresa que
  representa.

• O Ady é destinado ao uso profissional para criação e análise de campanhas.
  É proibido usar a plataforma para:
    - conteúdo ilegal, ofensivo, discriminatório ou que viole direitos de
      terceiros;
    - tentar comprometer a segurança, estabilidade ou integridade do serviço;
    - acesso não autorizado, engenharia reversa ou uso indevido de dados;
    - reproduzir ou revender o serviço sem autorização (incluindo white-label
      fora do acordo comercial estabelecido).

• O não cumprimento pode levar à suspensão ou encerramento da conta.


--------------------------------------------------------------------------------
7. ALTERAÇÕES DESTAS POLÍTICAS
--------------------------------------------------------------------------------

• Podemos atualizar estas políticas a qualquer momento. Mudanças relevantes
  serão comunicadas no aplicativo ou por e-mail. O uso contínuo após a
  atualização implica concordância com a nova versão.

• Cada nova versão publicada recebe um número de versão e data de vigência,
  indicados no topo deste documento. O aceite do usuário fica registrado
  com a versão vigente no momento da concordância.

--------------------------------------------------------------------------------
CONTATO
--------------------------------------------------------------------------------
Para dúvidas sobre reembolso, privacidade ou uso dos seus dados, entre em
contato pelo canal de suporte oficial do Ady.

================================================================================
                    FIM — POLÍTICAS DE USO — ADY
================================================================================
'
WHERE NOT EXISTS (SELECT 1 FROM "policy_versions" WHERE "version" = '1.0');
