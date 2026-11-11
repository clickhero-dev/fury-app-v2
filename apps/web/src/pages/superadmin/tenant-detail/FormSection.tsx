import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface FormSectionProps {
  icon: LucideIcon;
  title: string;
  titleId?: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
}

// Card de seção com ícone, título e descrição
export function FormSection({ icon: Icon, title, titleId, description, right, children }: FormSectionProps) {
  return (
    <section
      aria-labelledby={titleId}
      className="bg-admin-surface border border-admin-border rounded-2xl p-5 space-y-4 min-w-0"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-admin-petrol/10 text-[#17708A] dark:text-[#1E88A8]">
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-semibold text-admin-text">{title}</h3>
          {description && <p className="text-xs text-admin-text-faint mt-0.5">{description}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// Rótulo de campo com ícone
export function FieldLabel({ icon: Icon, htmlFor, children }: { icon: LucideIcon; htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-admin-text-muted mb-1.5">
      <Icon aria-hidden="true" className="w-3.5 h-3.5 text-[#17708A] dark:text-[#1E88A8]" />
      {children}
    </label>
  );
}
