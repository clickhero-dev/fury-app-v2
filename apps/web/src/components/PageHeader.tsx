import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-text-primary">{title}</h1>
          {description && (
            <p className="text-base text-text-secondary">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
