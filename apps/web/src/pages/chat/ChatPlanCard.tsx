import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, Check, Circle, ClipboardList, Hand, Pause, Pencil, Play, X } from 'lucide-react';
import {
  canCompleteManualTask, chatPlanError, chatPlanStatusLabels, chatPlanTaskStatusLabels,
  type ChatPlan, type ChatPlanAction, type ChatPlanEdit, type ChatPlanTask,
} from './chat-plans';
import './chat-plans.css';

export type ChatPlanCardProps = {
  plan: ChatPlan;
  busy?: boolean;
  error?: string | null;
  onAction: (plan: ChatPlan, action: ChatPlanAction) => Promise<boolean>;
  onEdit: (plan: ChatPlan, changes: ChatPlanEdit) => Promise<boolean>;
  onCompleteTask: (plan: ChatPlan, task: ChatPlanTask) => Promise<boolean>;
};

function PlanDraftEditor({ plan, busy, readOnly, onSave, onCancel }: {
  plan: ChatPlan; busy: boolean; readOnly: boolean;
  onSave: (changes: ChatPlanEdit) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(plan.title);
  const [goal, setGoal] = useState(plan.goal);
  const [titles, setTitles] = useState(plan.tasks.map(task => task.title));
  const [invalid, setInvalid] = useState<string[]>([]);
  const titleInput = useRef<HTMLInputElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => { titleInput.current?.focus(); }, []);
  useEffect(() => { if (invalid.length) errorSummary.current?.focus(); }, [invalid]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || readOnly) return;
    const missing = [!title.trim() ? 'title' : '', !goal.trim() ? 'goal' : '', ...titles.map((value, index) => !value.trim() ? `task-${index}` : '')].filter(Boolean);
    setInvalid(missing);
    if (missing.length) return;
    onSave({
      version: plan.version, title: title.trim(), goal: goal.trim(),
      tasks: plan.tasks.map((task, index) => ({
        key: task.key, title: titles[index].trim(), capability: task.capability,
        parameters: task.parameters, dependsOn: task.dependsOn,
      })),
    });
  }
  const invalidProps = (field: string) => ({
    'aria-invalid': invalid.includes(field),
    'aria-describedby': invalid.includes(field) ? `${id}-${field}-error` : undefined,
  });
  const fieldError = (field: string) => invalid.includes(field)
    ? <span id={`${id}-${field}-error`} className="ady-chat-plan-field-error">Preencha este campo.</span> : null;

  return <form className="ady-chat-plan-editor" onSubmit={submit} noValidate aria-label="Editar plano">
    {invalid.length > 0 && <div role="alert" tabIndex={-1} ref={errorSummary} className="ady-chat-plan-error">
      <p>Preencha os campos indicados antes de salvar.</p>
      {invalid.map(field => <a key={field} href={`#${id}-${field}`} onClick={event => {
        event.preventDefault(); document.getElementById(`${id}-${field}`)?.focus();
      }}>{field === 'title' ? 'Título do plano' : field === 'goal' ? 'Objetivo do plano' : `Título da tarefa ${Number(field.slice(5)) + 1}`}</a>)}
    </div>}
    <label htmlFor={`${id}-title`}>Título do plano</label>
    <input ref={titleInput} id={`${id}-title`} value={title} maxLength={200} required disabled={busy} readOnly={readOnly}
      {...invalidProps('title')} onChange={event => setTitle(event.target.value)} />
    {fieldError('title')}
    <label htmlFor={`${id}-goal`}>Objetivo do plano</label>
    <textarea id={`${id}-goal`} value={goal} maxLength={4000} rows={3} required disabled={busy} readOnly={readOnly}
      {...invalidProps('goal')} onChange={event => setGoal(event.target.value)} />
    {fieldError('goal')}
    {plan.tasks.map((task, index) => <div className="ady-chat-plan-field" key={task.id}>
      <label htmlFor={`${id}-task-${index}`}>Título da tarefa {index + 1}</label>
      <input id={`${id}-task-${index}`} value={titles[index]} maxLength={200} required disabled={busy} readOnly={readOnly}
        {...invalidProps(`task-${index}`)} onChange={event => setTitles(previous => previous.map((value, position) => position === index ? event.target.value : value))} />
      {fieldError(`task-${index}`)}
    </div>)}
    <p className="ady-chat-plan-note">Os títulos organizam o plano; não mudam o que cada tarefa faz. Não é possível alterar instruções, datas ou valores neste editor. Se precisar mudá-los, não aprove este plano.</p>
    <div className="ady-chat-plan-actions">
      {!readOnly && <button type="submit" className="ady-chat-plan-button ady-chat-plan-button--primary" disabled={busy}>Salvar alterações</button>}
      <button type="button" className="ady-chat-plan-button" disabled={busy} onClick={onCancel}>Descartar alterações</button>
    </div>
  </form>;
}

const parameterLabels: Record<string, string> = {
  startDate: 'Data inicial', endDate: 'Data final', limit: 'Limite', offset: 'Deslocamento',
  prompt: 'Instrução', model: 'Modelo', aspect_ratio: 'Proporção', resolution: 'Resolução',
  photo_ids: 'IDs das fotos', reference_image_urls: 'URLs de referência', visual: 'Visual',
  narration: 'Narração', caption: 'Legenda', post_type: 'Tipo de publicação', scheduled_at: 'Data agendada',
  image_url: 'URL da mídia', image_urls: 'URLs das mídias', name: 'Nome', objective: 'Objetivo',
  daily_budget_cents: 'Orçamento diário em centavos', ad_account_id: 'Conta de anúncios',
};

function TaskParameters({ task }: { task: ChatPlanTask }) {
  const entries = Object.entries(task.parameters).filter(([key]) => key !== 'instructions');
  if (!entries.length) return null;
  return <details className="ady-chat-plan-note" open>
    <summary>Detalhes da tarefa (somente leitura)</summary>
    <dl>{entries.map(([key, value]) => <div key={key}>
      <dt>{Object.hasOwn(parameterLabels, key) ? parameterLabels[key] : 'Parâmetro desconhecido'}</dt>
      <dd>{Object.hasOwn(parameterLabels, key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        ? String(value) : Object.hasOwn(parameterLabels, key) && Array.isArray(value) && value.every(item => typeof item === 'string' || typeof item === 'number')
          ? value.join(', ') : 'Detalhe indisponível para visualização.'}</dd>
    </div>)}</dl>
  </details>;
}

function TaskEvidence({ task, index }: { task: ChatPlanTask; index: number }) {
  const result = task.result;
  if (!result) return task.status === 'completed'
    ? <p className="ady-chat-plan-note">Conclusão registrada pelo servidor. Nenhum detalhe adicional disponível.</p> : null;
  return <div className="ady-chat-plan-evidence" aria-label={`Resultado da tarefa ${index + 1}`}>
    {result.summary && <p>{result.summary}</p>}
    {result.text && result.text !== result.summary && (result.text.length <= 500
      ? <p className="ady-chat-plan-result-text">{result.text}</p>
      : <details>
        <summary>Ver resultado da tarefa {index + 1}</summary>
        <p className="ady-chat-plan-result-text">{result.text}</p>
      </details>)}
    {result.reference && <p className="ady-chat-plan-reference">Referência: {result.reference.id}</p>}
    {!result.summary && !result.text && !result.reference && <p>Resultado registrado pelo servidor.</p>}
  </div>;
}

export function ChatPlanCard({ plan, busy = false, error, onAction, onEdit, onCompleteTask }: ChatPlanCardProps) {
  const id = useId();
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChatPlan | null>(null);
  const [cancelRequested, setCancelRequested] = useState(false);
  const mutationLock = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const locked = busy || pending;
  const completed = plan.tasks.filter(task => task.status === 'completed').length;
  const final = plan.status === 'completed' || plan.status === 'cancelled';
  const editable = plan.status === 'draft';
  const shownError = localError || error;
  useEffect(() => { if (cancelRequested) keepButton.current?.focus(); }, [cancelRequested]);
  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus();
    wasEditing.current = Boolean(editing);
  }, [editing]);

  async function run(operation: () => Promise<boolean>): Promise<boolean> {
    if (busy || mutationLock.current) return false;
    mutationLock.current = true;
    setPending(true);
    setLocalError(null);
    try {
      const success = await operation();
      if (!success) setLocalError('Não foi possível atualizar o plano. Confira a orientação abaixo ou atualize a conversa antes de tentar novamente.');
      return success;
    } catch (failure) {
      setLocalError(chatPlanError(failure, 'update'));
      return false;
    } finally {
      mutationLock.current = false;
      setPending(false);
    }
  }
  async function save(changes: ChatPlanEdit) {
    if (!editing) return;
    if (await run(() => onEdit(editing, changes))) {
      setEditing(null);
      editButton.current?.focus();
    }
  }
  async function cancel() {
    if (await run(() => onAction(plan, 'cancel'))) setCancelRequested(false);
  }

  return <article className="ady-chat-plan" aria-label={`Plano: ${plan.title}`} aria-busy={locked} data-plan-id={plan.id} data-status={plan.status}>
    <header className="ady-chat-plan-header">
      <span className="ady-chat-plan-symbol" aria-hidden="true"><ClipboardList size={20} /></span>
      <div className="ady-chat-plan-heading">
        <p className="ady-chat-plan-eyebrow">Plano de ação</p>
        <h3>{plan.title}</h3>
      </div>
      <span className="ady-chat-plan-status" role="status">{chatPlanStatusLabels[plan.status]}</span>
    </header>
    <p className="ady-chat-plan-goal">{plan.goal}</p>
    <div className="ady-chat-plan-progress">
      <span aria-live="polite" aria-atomic="true">{completed} de {plan.tasks.length} tarefas concluídas</span>
      <progress aria-label="Tarefas concluídas" max={Math.max(1, plan.tasks.length)} value={completed} />
    </div>
    <ol className="ady-chat-plan-tasks" aria-label="Tarefas do plano">
      {plan.tasks.map((task, index) => {
        const Icon = task.status === 'completed' ? Check : task.status === 'failed' ? AlertCircle
          : task.status === 'waiting_approval' ? Hand : task.status === 'cancelled' ? X : Circle;
        return <li className="ady-chat-plan-task" key={task.id} data-status={task.status}>
          <span className="ady-chat-plan-task-marker" aria-hidden="true"><Icon size={16} /></span>
          <div className="ady-chat-plan-task-content">
            <h4><span aria-hidden="true">{index + 1}. </span><span>{task.title}</span></h4>
            <p className="ady-chat-plan-task-meta">{chatPlanTaskStatusLabels[task.status]}<span aria-hidden="true"> · </span>{task.capability === 'manual' ? 'Você confirma' : 'Ady executa'}</p>
            {task.capability === 'manual' && typeof task.parameters.instructions === 'string' && <p className="ady-chat-plan-note">{task.parameters.instructions}</p>}
            <TaskParameters task={task} />
            {task.dependsOn.length > 0 && <p className="ady-chat-plan-note">Depende de: {task.dependsOn.map(key => plan.tasks.find(dependency => dependency.key === key)?.title || 'tarefa anterior').join(', ')}.</p>}
            <TaskEvidence task={task} index={index} />
            {task.error && <p className="ady-chat-plan-task-error"><AlertCircle size={16} aria-hidden="true" />{task.error}</p>}
            {canCompleteManualTask(plan, task) && <button type="button" className="ady-chat-plan-button ady-chat-plan-button--manual" disabled={locked}
              aria-label={`Concluir tarefa ${task.title}`} onClick={() => { void run(() => onCompleteTask(plan, task)); }}>
              <Check size={16} aria-hidden="true" />Concluir tarefa
            </button>}
          </div>
        </li>;
      })}
    </ol>
    {plan.status === 'draft' && <p className="ady-chat-plan-note">Revise antes de começar. Publicações, criação de mídia e gastos precisam de aprovação separada.</p>}
    {plan.status === 'waiting_approval' && <p className="ady-chat-plan-notice">{plan.tasks.some(task => task.approvalId)
      ? 'Revise a ação pendente nesta conversa. O plano só avança após a confirmação do resultado.'
      : 'O plano aguarda sua confirmação. Confira as tarefas manuais e as ações pendentes nesta conversa.'}</p>}
    {plan.status === 'paused' && <p className="ady-chat-plan-note">Nenhuma nova tarefa será iniciada. Uma ação já em andamento ainda pode terminar.</p>}
    {plan.status === 'cancelled' && <p className="ady-chat-plan-note">As tarefas restantes foram canceladas. Isso não desfaz o que já foi feito; ações em andamento ainda podem terminar.</p>}
    {plan.status === 'failed' && <p className="ady-chat-plan-note">Confira a tarefa com erro antes de continuar. Resultados já confirmados serão mantidos.</p>}
    {shownError && <div className="ady-chat-plan-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><span>{error || shownError}</span></div>}
    {editing ? <>
      {!editable && <p className="ady-chat-plan-notice">O plano já começou. Suas alterações não foram salvas e não podem ser aplicadas à execução.</p>}
      {editable && editing.version !== plan.version && <div className="ady-chat-plan-notice">
        <p>Há uma versão mais recente. Sua edição foi mantida; recarregue para revisar as mudanças.</p>
        <button type="button" className="ady-chat-plan-button" disabled={locked} onClick={() => { setEditing(plan); setLocalError(null); }}>Recarregar edição</button>
      </div>}
      <PlanDraftEditor key={`${editing.id}-${editing.version}`} plan={editing} busy={locked} readOnly={!editable} onSave={changes => { void save(changes); }}
        onCancel={() => { setEditing(null); setLocalError(null); editButton.current?.focus(); }} />
    </> : <div className="ady-chat-plan-actions">
      {editable && <>
        <button type="button" className="ady-chat-plan-button ady-chat-plan-button--primary" disabled={locked} onClick={() => { void run(() => onAction(plan, 'approve')); }}><Play size={16} aria-hidden="true" />Aprovar e executar</button>
        <button type="button" ref={editButton} className="ady-chat-plan-button" disabled={locked} onClick={() => { setEditing(plan); setLocalError(null); }}><Pencil size={16} aria-hidden="true" />Editar plano</button>
      </>}
      {(plan.status === 'running' || plan.status === 'waiting_approval') && <button type="button" className="ady-chat-plan-button" disabled={locked} onClick={() => { void run(() => onAction(plan, 'pause')); }}><Pause size={16} aria-hidden="true" />Pausar plano</button>}
      {(plan.status === 'paused' || plan.status === 'failed') && <button type="button" className="ady-chat-plan-button ady-chat-plan-button--primary" disabled={locked} onClick={() => { void run(() => onAction(plan, 'resume')); }}><Play size={16} aria-hidden="true" />Continuar plano</button>}
      {!final && <button type="button" ref={cancelButton} className="ady-chat-plan-button ady-chat-plan-button--quiet" disabled={locked} aria-expanded={cancelRequested} aria-controls={`${id}-cancel`} onClick={() => setCancelRequested(true)}>Cancelar restantes</button>}
    </div>}
    {cancelRequested && !final && <div id={`${id}-cancel`} role="group" aria-label="Confirmar cancelamento do plano" className="ady-chat-plan-confirm">
      <p>Cancelar as tarefas restantes não desfaz o que já foi feito. Uma ação em andamento ainda pode terminar.</p>
      <div className="ady-chat-plan-actions">
        <button type="button" ref={keepButton} className="ady-chat-plan-button" disabled={locked} onClick={() => { setCancelRequested(false); cancelButton.current?.focus(); }}>Manter plano</button>
        <button type="button" className="ady-chat-plan-button ady-chat-plan-button--danger" disabled={locked} onClick={() => { void cancel(); }}>Confirmar cancelamento</button>
      </div>
    </div>}
  </article>;
}
