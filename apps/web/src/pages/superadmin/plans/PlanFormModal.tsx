import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Save, X } from "lucide-react";
import { PlanCard, LIMIT_FIELDS } from "./PlanCard";
import {
  INTERVAL_LABEL,
  LIMIT_MIN,
  applyLimitMode,
  centsFromInput,
  formatCents,
  limitMode,
  planChanges,
  setLimitQty,
  toggleView,
  validateDraft,
  viewVisible,
  VIEW_GROUP_LABEL,
  VIEW_PAIRS,
  type PlanView,
  type LimitKey,
  type LimitMode,
  type PlanDraft,
} from "./planForm";

interface PlanFormModalProps {
  mode: "new" | "edit";
  initial: PlanDraft;
  subscriberCount?: number;
  // funcionalidades configuráveis (vazio = seção some)
  views?: PlanView[];
  saving: boolean;
  error: string;
  onSubmit: (draft: PlanDraft) => void;
  onClose: () => void;
}

const LIMIT_HELP: Record<LimitKey, string> = {
  creativesPerMonth: "Quantos criativos de imagem o cliente gera por mês.",
  modificationsPerCreative: "Quantas vezes cada criativo pode ser ajustado.",
  videosPerMonth: "Sem vídeo desliga o vídeo no plano.",
  modificationsPerVideo: "Quantas vezes cada vídeo pode ser ajustado.",
};

const inputCls =
  "w-full bg-admin-bg border rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol";
const groupTitle = "text-[11px] font-bold uppercase tracking-wider text-admin-text-faint";
const segBtn = (on: boolean) =>
  `ady-btn rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
    on ? "bg-admin-surface text-[#17708A] dark:text-[#1E88A8] shadow-sm" : "text-admin-text-muted hover:text-admin-text"
  }`;

// Quantidade livre enquanto digita; corrige ao sair do campo
function QtyInput({ value, min, label, disabled, placeholder, onCommit }: {
  value: number | null | undefined;
  min: number;
  label: string;
  disabled: boolean;
  placeholder: string;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(disabled ? "" : String(value ?? ""));
  useEffect(() => setText(disabled ? "" : String(value ?? "")), [value, disabled]);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      aria-label={label}
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && n >= min) onCommit(n);
      }}
      onBlur={() => {
        const n = Number(text);
        onCommit(text === "" || !Number.isFinite(n) ? min : n);
        setText(String(Math.max(min, Math.floor(text === "" || !Number.isFinite(n) ? min : n))));
      }}
      className={`${inputCls} border-admin-border w-16 h-9 px-1 py-1 text-center font-bold tabular-nums disabled:bg-admin-surface-2 disabled:text-admin-text-faint`}
    />
  );
}

// Modal único para criar e editar plano
export function PlanFormModal({ mode, initial, subscriberCount = 0, views = [], saving, error, onSubmit, onClose }: PlanFormModalProps) {
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const isNew = mode === "new";
  const changed = isNew || Object.keys(planChanges(initial, draft)).length > 0;
  // durante o envio não fecha
  const close = () => { if (!saving) onClose(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  function submit() {
    if (!changed || saving) return;
    const found = validateDraft(draft, isNew ? undefined : initial);
    setErrors(found);
    // leva até o primeiro campo com erro
    if (found.name) { nameRef.current?.focus(); return; }
    if (found.price) { priceRef.current?.focus(); return; }
    onSubmit({ ...draft, name: draft.name.trim() });
  }

  function setMode(key: LimitKey, m: LimitMode) {
    setDraft((d) => ({ ...d, limits: applyLimitMode(d.limits, key, m) }));
  }

  function setQty(key: LimitKey, value: number) {
    setDraft((d) => ({ ...d, limits: setLimitQty(d.limits, key, value) }));
  }

  const videoOff = !draft.limits.videosPerMonth && draft.limits.videosPerMonth !== null;

  function viewRow(view: PlanView) {
    const visible = (key: string) => viewVisible(draft.blockedViews, key, views) && !views.find((v) => v.key === key)?.locked;
    const parentOff = view.parent !== null && !visible(view.parent);
    const on = !view.locked && viewVisible(draft.blockedViews, view.key, views);
    const disabled = view.locked || parentOff;
    const hint = view.locked ? "Não disponível para o seu perfil" : parentOff ? "Desligada junto com a principal" : on ? "O cliente vê" : "O cliente não vê";
    const pair = VIEW_PAIRS[view.key];
    const pairName = pair && views.find((v) => v.key === pair.other)?.description;
    // ligado e o par desligado: só avisa
    const pairWarn = pair && pairName && on && !visible(pair.other);
    return (
      <div key={view.key} className={`flex items-center justify-between gap-3 px-4 py-3 ${view.parent ? "pl-10" : ""} ${disabled ? "opacity-60" : ""}`}>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-admin-text">{view.description}</div>
          <div className="text-xs text-admin-text-muted">{hint}</div>
          {pair && pairName && (
            <div className={`text-xs mt-0.5 ${pairWarn ? "text-[#B55F02] dark:text-spark" : "text-admin-text-faint"}`}>
              {pairWarn ? `Recomendado manter junto com ${pairName}.` : pair.text}
            </div>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={view.description}
          disabled={disabled}
          onClick={() => setDraft((d) => ({ ...d, blockedViews: toggleView(d.blockedViews, view.key, views) }))}
          className="ady-btn shrink-0 disabled:cursor-not-allowed"
        >
          <div className={`relative w-11 h-6 rounded-full transition-colors ${on ? "bg-admin-petrol" : "bg-admin-border"}`}>
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
          </div>
        </button>
      </div>
    );
  }

  function limitRow(key: LimitKey) {
    const field = LIMIT_FIELDS.find((f) => f.key === key)!;
    const Icon = field.icon;
    const value = draft.limits[key];
    const current = limitMode(key, value);
    const dim = key === "modificationsPerVideo" && videoOff;
    const qty = current === "qty" && !dim;
    const opts: [LimitMode, string][] = key === "videosPerMonth"
      ? [["off", "Sem vídeo"], ["none", "Sem limite"], ["qty", "Quantidade"]]
      : [["none", "Sem limite"], ["qty", "Quantidade"]];
    return (
      <div key={key} className={`p-4 space-y-3 ${dim ? "opacity-50" : ""}`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center bg-admin-petrol/10 text-[#17708A] dark:text-[#1E88A8]">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-admin-text">{field.label}</div>
            <div className="text-xs text-admin-text-muted">{dim ? "Vídeo desligado no plano." : LIMIT_HELP[key]}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div role="group" aria-label={field.label} className="flex-1 basis-56 grid grid-flow-col auto-cols-fr gap-1 bg-admin-bg border border-admin-border rounded-xl p-1">
            {opts.map(([m, label]) => (
              <button key={m} type="button" aria-pressed={current === m} disabled={dim} onClick={() => setMode(key, m)} className={segBtn(current === m)}>
                {label}
              </button>
            ))}
          </div>
          {/* quantidade fica sempre no mesmo lugar */}
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" aria-label={`Diminuir ${field.label}`} disabled={!qty} onClick={() => setQty(key, (value ?? 0) - 1)} className="ady-btn w-9 h-9 rounded-lg border border-admin-border bg-admin-surface-2 flex items-center justify-center disabled:opacity-40">
              <Minus className="w-4 h-4" />
            </button>
            <QtyInput
              value={value}
              min={LIMIT_MIN[key]}
              label={`Quantidade de ${field.label.toLowerCase()}`}
              disabled={!qty}
              placeholder={current === "none" ? "∞" : "0"}
              onCommit={(n) => setQty(key, n)}
            />
            <button type="button" aria-label={`Aumentar ${field.label}`} disabled={!qty} onClick={() => setQty(key, (value ?? 0) + 1)} className="ady-btn w-9 h-9 rounded-lg border border-admin-border bg-admin-surface-2 flex items-center justify-center disabled:opacity-40">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-form-title"
        className="bg-admin-surface border border-admin-border rounded-2xl w-full max-w-4xl max-h-full overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-admin-surface border-b border-admin-border px-6 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="plan-form-title" className="text-lg font-semibold text-admin-text">{isNew ? "Novo Plano" : "Editar plano"}</h2>
            <div className="text-xs text-admin-text-muted">
              {isNew ? "Preencha os dados e confira a prévia do card." : `${initial.name} · ${subscriberCount} assinante${subscriberCount !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button type="button" onClick={close} disabled={saving} aria-label="Fechar" className="ady-btn text-admin-text-faint hover:text-admin-text transition-colors disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* sem <form>: o CSS claro força borda e fundo em "form input" */}
        <div
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 p-6"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); submit(); }
          }}
        >
          <div className="space-y-6 min-w-0">
            <div className="space-y-3">
              <div className={groupTitle}>Dados do plano</div>
              <div>
                <label htmlFor="plan-name" className="block text-xs font-medium text-admin-text-muted mb-1.5">Nome do plano</label>
                <input
                  id="plan-name"
                  ref={nameRef}
                  autoFocus
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => { setDraft({ ...draft, name: e.target.value }); if (errors.name) setErrors({ ...errors, name: undefined }); }}
                  placeholder="Nome do plano"
                  aria-invalid={Boolean(errors.name)}
                  className={`${inputCls} ${errors.name ? "border-error" : "border-admin-border"}`}
                />
                {errors.name && <div className="text-xs text-error mt-1">{errors.name}</div>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="plan-price" className="block text-xs font-medium text-admin-text-muted mb-1.5">Preço (R$)</label>
                  <div className="relative">
                    <div aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-admin-text-muted">R$</div>
                    <input
                      id="plan-price"
                      ref={priceRef}
                      inputMode="numeric"
                      value={formatCents(draft.priceCents)}
                      onChange={(e) => { setDraft({ ...draft, priceCents: centsFromInput(e.target.value) }); if (errors.price) setErrors({ ...errors, price: undefined }); }}
                      aria-invalid={Boolean(errors.price)}
                      className={`${inputCls} pl-11 font-bold tabular-nums ${errors.price ? "border-error" : "border-admin-border"}`}
                    />
                  </div>
                  {errors.price && <div className="text-xs text-error mt-1">{errors.price}</div>}
                </div>
                <div>
                  <div className="block text-xs font-medium text-admin-text-muted mb-1.5">Intervalo</div>
                  <div role="group" aria-label="Intervalo" className="grid grid-cols-2 gap-1 bg-admin-bg border border-admin-border rounded-xl p-1">
                    {Object.entries(INTERVAL_LABEL).map(([v, label]) => (
                      <button key={v} type="button" aria-pressed={draft.interval === v} onClick={() => setDraft({ ...draft, interval: v })} className={segBtn(draft.interval === v)}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <div className="block text-xs font-medium text-admin-text-muted mb-1.5">Ativo</div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.isActive}
                  aria-label="Ativo"
                  onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}
                  className="ady-btn flex items-center gap-2.5"
                >
                  <div className={`relative w-11 h-6 rounded-full transition-colors ${draft.isActive ? "bg-admin-petrol" : "bg-admin-border"}`}>
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${draft.isActive ? "translate-x-5" : ""}`} />
                  </div>
                  <div className="text-sm font-semibold text-admin-text">{draft.isActive ? "Sim" : "Não"}</div>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className={groupTitle}>Limites de imagem</div>
              <div className="border border-admin-border rounded-xl divide-y divide-admin-border">
                {limitRow("creativesPerMonth")}
                {limitRow("modificationsPerCreative")}
              </div>
            </div>
            <div className="space-y-3">
              <div className={groupTitle}>Limites de vídeo</div>
              <div className="border border-admin-border rounded-xl divide-y divide-admin-border">
                {limitRow("videosPerMonth")}
                {limitRow("modificationsPerVideo")}
              </div>
            </div>
            {views.length > 0 && (
              <div className="space-y-3">
                <div>
                  <div className={groupTitle}>O que o cliente vê</div>
                  <div className="text-xs text-admin-text-muted mt-1">Desligue o que quem assinar este plano não deve ver nem usar.</div>
                </div>
                {(["ads", "content"] as const).map((group) => (
                  <div key={group} role="group" aria-label={VIEW_GROUP_LABEL[group]} className="border border-admin-border rounded-xl divide-y divide-admin-border">
                    <div className="px-4 py-2 text-xs font-bold text-admin-text-muted">{VIEW_GROUP_LABEL[group]}</div>
                    {views.filter((v) => v.group === group).map(viewRow)}
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-2 lg:sticky lg:top-24 self-start">
            <div className={groupTitle}>Prévia do card</div>
            <PlanCard plan={draft} preview />
          </aside>
        </div>

        <div className="sticky bottom-0 bg-admin-surface border-t border-admin-border px-6 py-4 flex flex-wrap items-center justify-end gap-3">
          {/* erro da API sempre visível, junto dos botões */}
          {error && <div role="alert" className="w-full text-sm text-error bg-error/10 border border-error/30 rounded-xl px-3 py-2.5">{error}</div>}
          {!changed && <div className="mr-auto text-xs text-admin-text-faint">Nenhuma alteração ainda.</div>}
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="ady-btn bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 rounded-full text-sm font-semibold transition-colors px-5 py-2.5 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!changed || saving}
            className="ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-5 py-2.5 flex items-center gap-2"
          >
            {isNew ? <Plus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isNew ? "Criar" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
