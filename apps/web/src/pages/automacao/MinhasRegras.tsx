import { useState } from 'react';
import { AppLayout, PageHeader, Button, DataTable, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components';
import { FuryRuleDialog } from '@/components/FuryRuleDialog';
import {
  useGetFuryRules,
  useCreateFuryRule,
  useUpdateFuryRule,
  useDeleteFuryRule,
  type FuryRule,
  type CreateFuryRulePayload,
} from '@/hooks/useFuryRules';

/**
 * Página de gerenciamento de regras de automação do usuário.
 *
 * Lista todas as regras FURY cadastradas, permitindo criar, editar,
 * ativar/desativar e deletar regras que disparam ações automáticas
 * sobre campanhas com base em métricas de performance.
 *
 * @remarks
 * - Utiliza `useGetFuryRules` para buscar as regras via React Query
 * - Criação e edição são feitas via `FuryRuleDialog`
 * - Deleção exige confirmação em um `Dialog` secundário
 * - O toggle de status (ativa/inativa) é feito inline na tabela,
 *   sem abrir o dialog de edição
 *
 * @example
 * // Registrada na rota protegida `/automacao`
 * <Route path="/automacao" element={<MinhasRegras />} />
 */
export function MinhasRegras() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<FuryRule | undefined>();
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  const { data, isLoading } = useGetFuryRules();
  const createMutation = useCreateFuryRule();
  const updateMutation = useUpdateFuryRule();
  const deleteMutation = useDeleteFuryRule();

  const rules = data?.data || [];

  /**
   * Abre o dialog de criação ou edição de regra.
   * Se `rule` for fornecida, o dialog entra em modo de edição.
   *
   * @param rule - Regra existente para edição, ou `undefined` para criação
   */
  const handleOpenDialog = (rule?: FuryRule) => {
    setSelectedRule(rule);
    setIsDialogOpen(true);
  };

  /** Fecha o dialog e limpa a regra selecionada do estado local. */
  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedRule(undefined);
  };

  /**
   * Persiste a regra no backend — cria ou atualiza dependendo
   * se `selectedRule` está definida.
   *
   * @param payload - Dados do formulário validados pelo `FuryRuleDialog`
   */
  const handleSave = async (payload: CreateFuryRulePayload) => {
    try {
      if (selectedRule) {
        await updateMutation.mutateAsync({
          id: selectedRule.id,
          payload,
        });
      } else {
        await createMutation.mutateAsync(payload);
      }
      handleCloseDialog();
    } catch (error) {
      console.error('Error saving rule:', error);
    }
  };

  /**
   * Alterna o status `isActive` de uma regra entre ativa e inativa.
   *
   * @param rule - Regra cujo status será invertido
   */
  const handleToggleActive = async (rule: FuryRule) => {
    try {
      await updateMutation.mutateAsync({
        id: rule.id,
        payload: { isActive: !rule.isActive },
      });
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };

  /**
   * Abre o dialog de confirmação de deleção para a regra informada.
   *
   * @param id - ID da regra a ser deletada
   */
  const handleDelete = (id: string) => {
    setDeleteRuleId(id);
  };

  /** Executa a deleção da regra após confirmação do usuário. */
  const handleConfirmDelete = async () => {
    if (!deleteRuleId) return;
    try {
      await deleteMutation.mutateAsync(deleteRuleId);
    } catch (error) {
      console.error('Error deleting rule:', error);
    } finally {
      setDeleteRuleId(null);
    }
  };

  /**
   * Retorna o label legível de uma métrica pelo seu campo interno.
   *
   * @param field - Campo da métrica (ex: `'cpc'`, `'roas'`)
   * @returns Label formatado (ex: `'CPC'`, `'ROAS'`) ou o próprio campo como fallback
   */
  const getMetricLabel = (field: string) => {
    const metrics: Record<string, string> = {
      cpc: 'CPC',
      ctr: 'CTR',
      roas: 'ROAS',
      cpa: 'CPA',
      spend: 'Spend',
    };
    return metrics[field] || field;
  };

  /**
   * Retorna o símbolo do operador de comparação.
   *
   * @param op - Operador interno (ex: `'gt'`, `'lt'`, `'eq'`)
   * @returns Símbolo correspondente (`'>'`, `'<'`, `'='`) ou o próprio operador como fallback
   */
  const getOperatorLabel = (op: string) => {
    const operators: Record<string, string> = {
      gt: '>',
      lt: '<',
      eq: '=',
    };
    return operators[op] || op;
  };

  /**
   * Retorna o label legível de uma ação de automação.
   *
   * @param action - Ação interna (ex: `'pause_campaign'`, `'notify'`)
   * @returns Label formatado (ex: `'Pausar Campanha'`, `'Notificar'`) ou fallback
   */
  const getActionLabel = (action: string) => {
    const actions: Record<string, string> = {
      pause_campaign: 'Pausar Campanha',
      reduce_budget: 'Reduzir Orçamento',
      notify: 'Notificar',
      increase_budget: 'Aumentar Orçamento',
    };
    return actions[action] || action;
  };

  const columns = [
    {
      key: 'name' as const,
      label: 'Nome',
      render: (value: string | boolean | undefined) => <span className="font-medium">{value}</span>,
    },
    {
      key: 'conditionField' as const,
      label: 'Condição',
      render: (_: string | boolean | undefined, row: FuryRule) => (
        <span className="text-text-secondary text-sm">
          {getMetricLabel(row.conditionField)} {getOperatorLabel(row.conditionOperator)}{' '}
          {row.conditionValue}
        </span>
      ),
    },
    {
      key: 'action' as const,
      label: 'Ação',
      render: (value: string | boolean | undefined) => <span className="text-sm">{getActionLabel(String(value))}</span>,
    },
    {
      key: 'isActive' as const,
      label: 'Status',
      align: 'center' as const,
      render: (_: string | boolean | undefined, row: FuryRule) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleToggleActive(row); }}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
            row.isActive
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {row.isActive ? '✓ Ativa' : '○ Inativa'}
        </button>
      ),
    },
    {
      key: 'updatedAt' as const,
      label: 'Última atualização',
      align: 'right' as const,
      render: (value: string | boolean | undefined) => {
        const date = new Date(String(value));
        const isValid = !isNaN(date.getTime());
        return (
          <span className="text-text-secondary text-sm">
            {isValid ? date.toLocaleDateString('pt-BR') : '—'}
          </span>
        );
      },
    },
    {
      key: 'id' as const,
      label: 'Ações',
      align: 'right' as const,
      render: (_: string | boolean | undefined, row: FuryRule) => (
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => handleOpenDialog(row)}
            className="text-accent hover:text-accent/80 text-sm font-semibold transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="text-red-600 hover:text-red-700 text-sm font-semibold transition-colors"
          >
            Deletar
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-text-primary">Minhas Regras</h2>
          <Button variant="primary" size="md" onClick={() => handleOpenDialog()}>
            +<span className="hidden sm:inline"> Nova Regra</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Minhas Regras"
          description="Crie e gerencie regras automáticas para otimizar suas campanhas"
        />

        <DataTable
          columns={columns}
          data={rules}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="Nenhuma regra criada ainda. Clique em 'Nova Regra' para começar."
        />
      </div>

      <FuryRuleDialog
        isOpen={isDialogOpen}
        onClose={handleCloseDialog}
        onSave={handleSave}
        rule={selectedRule}
        isPending={createMutation.isPending || updateMutation.isPending}
      />

      <Dialog open={deleteRuleId !== null} onOpenChange={(open) => { if (!open) setDeleteRuleId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deletar regra</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja deletar esta regra? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteRuleId(null)} disabled={deleteMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
            >
              {deleteMutation.isPending ? 'Deletando...' : 'Deletar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}