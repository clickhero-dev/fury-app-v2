import type { FormHTMLAttributes } from 'react';
import { FormProvider } from 'react-hook-form';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

interface FormProps<T extends FieldValues> extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  form: UseFormReturn<T>;
  onSubmit: (data: T) => void;
}

export function Form<T extends FieldValues>({ form, onSubmit, children, ...props }: FormProps<T>) {
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} {...props}>
        {children}
      </form>
    </FormProvider>
  );
}


export function FormItem({ children }: any) {
  return <div className="space-y-2">{children}</div>;
}

export function FormLabel({ children, ...props }: any) {
  return (
    <label className="text-sm font-medium text-gray-900" {...props}>
      {children}
    </label>
  );
}

export function FormControl({ children }: any) {
  return <>{children}</>;
}

export function FormMessage({ children }: any) {
  return children ? <p className="text-xs text-red-600">{children}</p> : null;
}
