# Spike — saldo de anúncios Meta no Ady

**Data da evidência:** 2026-11-03

**Status:** concluído — veredito B (integração direta não comprovada)
**Escopo:** investigação e UX; este documento não autoriza cobrança, persistência ou mudança de saldo.

## Veredito

O Ady **não deve** receber cartão, criar cobranças, adicionar fundos ou alterar
métodos de pagamento Meta. A documentação pública consultada não fornece um
contrato de Marketing API para essas mutações; os escopos atuais do Ady também
não são uma autorização financeira. A solução recomendada é identificar a conta
e seu estado quando a Meta documentar um campo de leitura aplicável e abrir o
Billing da Meta no contexto da conta. Nunca apresentar uma recarga como
concluída antes de uma leitura posterior e comprovada da Meta.

## Evidência e limites da investigação

| Fonte oficial | O que foi verificado | Resultado no spike |
|---|---|---|
| [Marketing API](https://developers.facebook.com/docs/marketing-api/) | Superfície pública de campanhas e contas | Não foi encontrada operação pública verificável de `add funds`, cobrança ou método de pagamento para conta de anúncios. A URL bloqueou consulta automatizada com `429`; não é evidência positiva de contrato. |
| [Referência Ad Account](https://developers.facebook.com/docs/marketing-api/reference/ad-account/) | Campos e edges da conta de anúncios | Referência indicada para validar campos de leitura por versão/conta. Sem credencial e sandbox autorizados, nenhum campo financeiro será considerado disponível por inferência. |
| [Billing and payments](https://www.facebook.com/business/help/1633979703374783) | Processo de cobrança gerenciado pela Meta | A página exige sessão na consulta automatizada. É referência do produto, não contrato de API para o Ady. |
| Código local | `apps/api/src/lib/meta-api.ts`, `apps/api/src/services/meta/meta.service.ts`, `packages/db/src/schema.ts` | Só lista contas (`id`, `name`, `account_status`, `currency`, `timezone_name`) e usa `business_management`, `ads_management`, `ads_read`; não há billing client, rota, serviço, ledger nem entidade de recarga. |

**Regra de evidência:** uma API só passa para implementação depois de URL de
referência pública/versionada, endpoint+método, payload, erros, permissão,
aprovação de app e execução em ambiente autorizado. Ausência de documentação
consultável, ou campo visto em uma conta, não é contrato universal.

## Matriz de capacidade

| Capacidade | Pré-paga | Pós-paga/automática | Invoice/linha de crédito | Permissão/papel mínimo | Evidência e decisão |
|---|---|---|---|---|---|
| Listar conta e moeda | Possível no cliente atual | Possível no cliente atual | Possível no cliente atual | `ads_read`/acesso à conta; BM quando aplicável | Implementado apenas para metadados de conta; não identifica modalidade de cobrança. |
| Consultar saldo/estado financeiro | A validar campo por versão e modalidade | Saldo não deve ser presumido; pode haver gasto/fatura | Não deve ser tratado como saldo | Papel financeiro e contrato de campo a confirmar; os escopos atuais não bastam como prova | Candidata futura somente como **leitura cache-first**. Não há campo financeiro contratado neste spike. |
| Adicionar fundos | Não comprovado por API pública | Não se aplica como “saldo” | Não se aplica | Contrato financeiro específico, aprovação e papel financeiro — todos não comprovados | **Não implementar.** CTA abre Billing Meta. |
| Adicionar/alterar cartão, banco ou outro funding source | Não comprovado | Não comprovado | Não comprovado | Contrato específico e requisitos de compliance — não comprovados | **Não implementar nem coletar dados de pagamento.** |
| Histórico de recargas | Apenas se endpoint/relatório confiável for contratado | Apenas se fonte Meta distinguir cobrança de gasto | Apenas se fonte Meta estiver autorizada | Mesmo contrato da leitura | Exibir link ao Billing; não criar histórico local derivado. |

### Restrições de modalidade, país, moeda e estado

- **Pré-paga:** somente a própria Meta pode confirmar se a conta aceita
  depósito, limite e método na região/moeda. O CTA pode dizer “Gerenciar saldo
  na Meta”, nunca prometer que haverá recarga.
- **Pós-paga/automática:** não mostrar “saldo disponível” nem campo de valor;
  explicar que a cobrança segue a configuração da conta e encaminhar ao
  Billing.
- **Invoice/linha de crédito:** não expor limite, saldo ou fatura sem fonte
  contratada; o fluxo é exclusivamente de consulta/encaminhamento.
- **Conta desabilitada, moeda/país incompatível, conta não selecionada ou papel
  insuficiente:** não tentar novamente de forma automática e oferecer o mesmo
  caminho seguro para a Meta.

## Matriz de permissões e acesso

| Camada | Situação atual | O que seria necessário para uma futura leitura | O que seria necessário para mutação financeira |
|---|---|---|---|
| OAuth | `ads_read`, `ads_management`, `business_management` já são solicitados | Escopo explicitamente documentado para cada campo; consentimento incremental e App Review se exigidos | Escopo/contrato explicitamente financeiro; não inferir de `ads_management` |
| App Meta | Integração de anúncios existente | Revisão/aprovação conforme documentação vigente e usuários fora dos papéis do app | Aprovação escrita da superfície de pagamento e qualquer requisito contratual/compliance |
| Pessoa/Business Manager | Acesso à conta é necessário para listá-la | Papel que permita ver os dados financeiros específicos | Papel financeiro que a Meta documentar; o Ady não eleva privilégios |
| Ady | Token cifrado e seleção de conta existem | Repository tenant-bound, cache/snapshot e erro sanitizado | Idempotência, reconciliação, ledger auditável e processamento seguro — somente após contrato Meta |

## Contrato de wire: gate para qualquer fase de implementação

Não há prova de wire executável neste ticket: não existem credenciais nem
sandbox financeira autorizada. Este é o checklist bloqueante, e não uma proposta
de endpoint:

1. Registrar versão, URL pública, método HTTP, campos aceitos/devolvidos e
   semântica de valores (saldo, gasto, crédito ou fatura).
2. Confirmar por conta de teste os escopos OAuth, App Review, papel BM,
   modalidade, país, moeda, mínimos/máximos e métodos admitidos.
3. Para mutação, registrar chave de idempotência, timeout, correlação,
   estados assíncronos, códigos de erro e política de retry. Um timeout é
   **não conclusivo**, nunca autorização para repetir cobrança.
4. Confirmar a operação somente após leitura posterior idempotente da Meta,
   guardando fonte e horário; callbacks tardios entram em reconciliação.
5. Só então desenhar adapter externo com timeout obrigatório, repository
   tenant-bound, `partial_failures`, telemetria sanitizada e feature flag.

## UX proposto

### Fluxo e telas

```text
[Conta de anúncios] → [Entender cobrança] → [Billing Meta]
          │                    │                    │
          │                    ├─ pré-paga elegível? ─→ CTA “Gerenciar saldo na Meta”
          │                    ├─ pós-paga? ─────────→ “A cobrança é automática” + CTA
          │                    └─ desconhecida/erro ─→ aviso + CTA de fallback
          └─ nenhuma leitura financeira contratada → não exibir saldo, valor ou cartão
```

1. **Selecionar conta:** nome, identificador mascarado (`act_•••1234`), moeda e
   status de conexão. O usuário escolhe a conta antes de abrir a Meta; não se
   põe token, ID completo em URL, cartão ou payload na interface.
2. **Entender cobrança:** se houver classificação confirmada pela Meta, mostra
   modalidade e o texto correspondente. A caixa “valor da recarga” só poderá
   existir depois do gate de wire aprovado; nesta fase ela é deliberadamente
   ausente.
3. **Encaminhar:** botão abre uma nova aba para o Billing/Ads Manager da Meta,
   com conta selecionada quando a Meta oferecer deep link estável. Caso não
   ofereça, abrir o domínio oficial de Billing sem parâmetros sensíveis e
   instruir a selecionar a conta. `noopener,noreferrer`; não anexar token,
   e-mail, tenant, valores ou estado OAuth ao link.
4. **Retorno ao Ady:** botão “Atualizar status” só agenda/consulta a leitura
   permitida. Enquanto não há campo financeiro contratado, o retorno confirma
   somente que o usuário voltou, nunca a recarga.
5. **Histórico:** exibir link “Ver histórico na Meta”. Uma lista local só nasce
   quando uma fonte Meta confiável identifica operação, moeda, status e data;
   até lá não sintetizar um ledger.

### Estados, texto e ação

| Estado | Tratamento visual client-safe | Ação |
|---|---|---|
| Pré-paga elegível confirmada | “Gerencie os créditos desta conta diretamente na Meta.” Mostrar moeda e limites somente se a fonte os fornecer. | Abrir Billing Meta. |
| Pós-paga/automática | “Esta conta é cobrada conforme a configuração de pagamento da Meta; não há saldo para adicionar aqui.” | Abrir Billing Meta. |
| Sem permissão/papel | “Você não tem acesso financeiro a esta conta. Peça acesso a um administrador no Meta Business.” | Abrir Billing Meta; não afirmar sucesso. |
| Conta incompatível/país ou método indisponível | “A Meta não disponibilizou esta ação para esta conta.” | Abrir Billing Meta; sem retry automático. |
| Leitura indisponível/token expirado | “Não foi possível consultar a situação agora. Seus anúncios não foram alterados.” | Reconectar ou abrir Billing Meta. |
| Operação futura pendente/timeout | “Ainda não há confirmação da Meta. Verifique o Billing antes de tentar novamente.” | Ver histórico/atualizar; sem nova mutação. |
| Saldo futuro confirmado | Valor, moeda, fonte e `consultado em`; nunca “recarga concluída” sem leitura posterior. | Atualizar assíncrono. |

## Contrato de erro futuro

O backend normaliza para códigos estáveis e mensagens sem token, payload, cartão,
stack ou saldo não confirmado. A tela pode receber `data` antiga e
`partial_failures`; uma falha de uma conta não derruba a lista.

| Código | HTTP indicativo | Mensagem exibida | Regra |
|---|---:|---|---|
| `META_BILLING_UNSUPPORTED` | 422 | “Esta ação não está disponível para esta conta no Ady.” | Fallback Meta; sem retry. |
| `META_FINANCIAL_PERMISSION_DENIED` | 403 | “Você precisa de acesso financeiro no Meta para continuar.” | Nunca inferir o papel exato. |
| `META_TOKEN_EXPIRED` | 401 | “Reconecte sua conta Meta para continuar.” | Não abrir fluxo autenticado pelo token do Ady. |
| `META_BILLING_PENDING` | 202 | “A Meta ainda não confirmou esta operação.” | Sem duplicar ação. |
| `META_BILLING_UNCONFIRMED` | 504/502 | “Não foi possível confirmar a atualização. Verifique o Billing da Meta.” | Timeout/ambiguidade não é falha nem sucesso. |
| `META_FINANCIAL_DATA_UNAVAILABLE` | 503 | “A situação financeira não está disponível agora.” | Preservar snapshot; atualizar em background. |

## BDD para implementação futura

```gherkin
Funcionalidade: orientar a gestão de cobrança Meta com segurança

Cenário: conta pré-paga com caminho suportado
  Dado uma conta pré-paga elegível e usuário com acesso financeiro
  Quando abre “Adicionar créditos”
  Então vê conta, moeda, limites fornecidos e CTA de Billing sem campo de cartão no Ady

Cenário: conta pós-paga
  Dado uma conta pós-paga
  Quando abre o fluxo
  Então vê que não há saldo para recarregar no Ady e o CTA para o Billing da Meta

Cenário: permissão insuficiente
  Dado token sem escopo ou papel financeiro
  Quando o Ady consulta a capacidade
  Então recebe erro client-safe e não vê sucesso nem mudança de estado

Cenário: conta incompatível ou método indisponível
  Dado resposta negativa da Meta
  Quando tenta seguir o fluxo
  Então vê indisponibilidade e fallback para o Billing sem retry destrutivo

Cenário: confirmação pendente ou falha
  Dado uma tentativa futura não confirmada
  Quando a Meta retorna pendência, timeout ou erro
  Então o Ady mostra estado não conclusivo e não duplica a operação

Cenário: saldo confirmado
  Dado confirmação idempotente e leitura posterior da Meta
  Quando retorna ao Ady
  Então vê fonte e horário da leitura após atualização assíncrona
```

Os testes da futura rota devem incluir: 200 de leitura, 400 de entrada inválida,
401 sem autenticação/token expirado, 403 tenant/papel errado, 404 conta ausente,
422 incompatível, timeout, falha parcial, estado pendente e deduplicação por
idempotência. Cada cenário abre em comentário Gherkin pt-BR no teste e usa
mock bloqueante da integração; sandbox real fica fora do CI.

## Próximo passo seguro

Solicitar à Meta, por canal oficial, confirmação do produto/API financeira,
contrato e acesso a ambiente de teste autorizado. Se a resposta não fornecer
todos os itens do gate de wire, manter este UX de encaminhamento e não iniciar
implementação de cobrança.
