import { useEffect, useState } from 'react';
import { Check, Clock, Loader2, MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useGoogleCategories,
  useGoogleSettings,
  useGoogleUpdateSettings,
} from '@/hooks/useGoogleSettings';
import type {
  GoogleAddress,
  GoogleBusinessHours,
  GoogleCategory,
} from '@/types/google';

const SURFACE_CARD = 'rounded-2xl border border-border bg-surface p-6 shadow-sm';
const FIELD_CLASS =
  'w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-xs text-text-primary outline-none transition focus:border-brand disabled:opacity-50';
const LABEL_CLASS = 'block text-xs font-medium text-text-tertiary';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

const WEEKDAYS = [
  { key: 'monday', label: 'Segunda' },
  { key: 'tuesday', label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday', label: 'Quinta' },
  { key: 'friday', label: 'Sexta' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
] as const;

const EMPTY_ADDRESS: GoogleAddress = { street: '', city: '', state: '', postalCode: '', country: 'BR' };

interface FormState {
  name: string;
  address: GoogleAddress;
  phone: string;
  email: string;
  website: string;
  categoryId: string | null;
  hours: GoogleBusinessHours;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function errorMessage(err: unknown): string {
  const axiosErr = err as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return (
    axiosErr.response?.data?.error?.message ??
    axiosErr.message ??
    'Não foi possível salvar os dados do negócio.'
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className={cn(LABEL_CLASS, required && 'after:ml-0.5 after:text-error after:content-["*"]')}>
        {label}
      </label>
      {children}
      {error && <p className="text-[11px] font-medium text-error">{error}</p>}
    </div>
  );
}

function CategoryAutocomplete({
  value,
  onChange,
  onSelect,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (category: GoogleCategory) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(value, 300);
  const { data: options = [], isFetching } = useGoogleCategories(debouncedQuery, open);

  function handleBlur() {
    setTimeout(() => setOpen(false), 150);
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={value}
          placeholder="Busque a categoria do seu negócio"
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          className={cn(FIELD_CLASS, 'pr-9')}
        />
        {isFetching ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-text-tertiary" />
        ) : (
          <X
            className="pointer-events-auto absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-pointer text-text-tertiary hover:text-text-primary"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange('');
            }}
          />
        )}
      </div>

      {open && (isFetching || options.length > 0) && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border bg-surface shadow-lg">
          {isFetching && (
            <p className="px-3 py-2 text-[11px] text-text-tertiary">Buscando categorias...</p>
          )}
          {!isFetching &&
            options.map((option) => (
              <button
                key={option.categoryId}
                type="button"
                onMouseDown={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-text-primary transition hover:bg-surface-secondary cursor-pointer"
              >
                <span>{option.displayName}</span>
                {option.parentId && (
                  <span className="text-[10px] text-text-tertiary">subcategoria</span>
                )}
              </button>
            ))}
        </div>
      )}
      {error && <p className="mt-1 text-[11px] font-medium text-error">{error}</p>}
    </div>
  );
}

export function BusinessProfileForm({
  onSaved,
  onError,
}: {
  onSaved?: () => void;
  onError?: (message: string) => void;
}) {
  const { data: settings, isLoading } = useGoogleSettings();
  const updateMutation = useGoogleUpdateSettings();

  const [form, setForm] = useState<FormState>({
    name: '',
    address: EMPTY_ADDRESS,
    phone: '',
    email: '',
    website: '',
    categoryId: null,
    hours: {},
  });
  const [categoryText, setCategoryText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      name: settings.name ?? '',
      address: { ...EMPTY_ADDRESS, ...(settings.address ?? {}) },
      phone: settings.phone ?? '',
      email: settings.email ?? '',
      website: settings.website ?? '',
      categoryId: settings.categoryId ?? null,
      hours: settings.hours ?? {},
    });
    if (settings.categoryId && settings.categoryDisplayName) {
      setCategoryText(settings.categoryDisplayName);
    }
  }, [settings]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (touched) {
      setErrors((e) => ({ ...e, [key]: undefined }));
    }
  }

  function selectCategory(category: GoogleCategory) {
    setForm((f) => ({ ...f, categoryId: category.categoryId || null }));
    setCategoryText(category.displayName);
    setErrors((e) => ({ ...e, category: undefined }));
  }

  function handleCategoryChange(value: string) {
    setCategoryText(value);
    setForm((f) => ({ ...f, categoryId: null }));
  }

  function setDay(day: string, enabled: boolean, open: string, close: string) {
    setForm((f) => {
      const hours = { ...f.hours };
      if (enabled && (open || close)) {
        hours[day] = [{ open: open || '09:00', close: close || '18:00' }];
      } else {
        delete hours[day];
      }
      return { ...f, hours };
    });
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Nome do negócio é obrigatório.';
    if (!form.address.street.trim() && !form.address.city.trim()) {
      next.address = 'Informe ao menos a rua ou a cidade do endereço.';
    }
    if (!form.phone.trim()) next.phone = 'Telefone é obrigatório.';
    return next;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    updateMutation.mutate(
      {
        name: form.name.trim(),
        address: { ...form.address, country: form.address.country || 'BR' },
        phone: form.phone.trim(),
        email: form.email.trim(),
        website: form.website.trim(),
        categoryId: form.categoryId,
        hours: Object.keys(form.hours).length > 0 ? form.hours : null,
      },
      {
        onSuccess: () => {
          setTouched(false);
          setErrors({});
          onSaved?.();
        },
        onError: (err) => {
          onError?.(errorMessage(err));
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className={`${SURFACE_CARD} flex items-center justify-center gap-3 px-6 py-16`}>
        <Loader2 className="h-4 w-4 animate-spin text-brand" />
        <p className="text-xs text-text-tertiary">Carregando dados do negócio...</p>
      </div>
    );
  }

  const prefilled = (settings?.prefilledFrom ?? []).length > 0;

  return (
    <form onSubmit={handleSubmit} className={`${SURFACE_CARD} space-y-6`}>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-brand" />
        <h3 className="text-base font-semibold text-text-primary">Dados do negócio</h3>
      </div>

      {prefilled && (
        <p className="rounded-xl border border-brand/20 bg-brand/10 px-3 py-2 text-[11px] text-text-primary">
          Preenchemos automaticamente com os dados do seu perfil no Ady. Revise antes de salvar.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do negócio" required error={errors.name}>
          <input
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="Ex.: Padaria Estrela"
            className={cn(FIELD_CLASS, errors.name && 'border-error')}
          />
        </Field>

        <Field label="Telefone" required error={errors.phone}>
          <input
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
            placeholder="Ex.: (11) 98765-4321"
            className={cn(FIELD_CLASS, errors.phone && 'border-error')}
          />
        </Field>
      </div>

      <div className={cn('space-y-4', errors.address && 'rounded-xl border border-error/40 p-3')}>
        <div className="flex items-center justify-between">
          <span className={cn(LABEL_CLASS, 'after:ml-0.5 after:text-error after:content-["*"]')}>
            Endereço
          </span>
          {errors.address && <span className="text-[11px] font-medium text-error">{errors.address}</span>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rua">
            <input
              value={form.address.street}
              onChange={(e) => setField('address', { ...form.address, street: e.target.value })}
              placeholder="Av. Paulista, 1000"
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Cidade">
            <input
              value={form.address.city}
              onChange={(e) => setField('address', { ...form.address, city: e.target.value })}
              placeholder="São Paulo"
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Estado">
            <input
              value={form.address.state}
              onChange={(e) => setField('address', { ...form.address, state: e.target.value })}
              placeholder="SP"
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="CEP">
            <input
              value={form.address.postalCode}
              onChange={(e) => setField('address', { ...form.address, postalCode: e.target.value })}
              placeholder="01310-100"
              className={FIELD_CLASS}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="contato@empresa.com.br"
            className={FIELD_CLASS}
          />
        </Field>

        <Field label="Website">
          <input
            type="url"
            value={form.website}
            onChange={(e) => setField('website', e.target.value)}
            placeholder="https://empresa.com.br"
            className={FIELD_CLASS}
          />
        </Field>
      </div>

      <Field label="Categoria" error={errors.category}>
        <CategoryAutocomplete
          value={categoryText}
          onChange={handleCategoryChange}
          onSelect={selectCategory}
          error={errors.category}
        />
      </Field>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-brand" />
          <h4 className="text-sm font-semibold text-text-primary">Horário de funcionamento</h4>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {WEEKDAYS.map(({ key, label }) => {
            const periods = form.hours[key] ?? [];
            const enabled = periods.length > 0;
            const open = periods[0]?.open ?? '09:00';
            const close = periods[0]?.close ?? '18:00';
            return (
              <div
                key={key}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2',
                  enabled ? 'border-brand/30 bg-brand/5' : 'border-border bg-surface-secondary'
                )}
              >
                <input
                  id={`hours-${key}`}
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setDay(key, e.target.checked, open, close)}
                  className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                />
                <label htmlFor={`hours-${key}`} className="w-20 shrink-0 text-xs font-medium text-text-primary">
                  {label}
                </label>
                {enabled && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={open}
                      onChange={(e) => setDay(key, true, e.target.value, close)}
                      className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-primary outline-none focus:border-brand"
                    />
                    <span className="text-[11px] text-text-tertiary">às</span>
                    <input
                      type="time"
                      value={close}
                      onChange={(e) => setDay(key, true, open, e.target.value)}
                      className="w-24 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-primary outline-none focus:border-brand"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {updateMutation.isPending && (
          <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Salvando...
          </span>
        )}
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className={cn(
            'inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-semibold text-white cursor-pointer',
            BUTTON_HOVER,
            updateMutation.isPending && 'opacity-50'
          )}
        >
          <Check className="h-3.5 w-3.5" />
          Salvar dados do negócio
        </button>
      </div>
    </form>
  );
}