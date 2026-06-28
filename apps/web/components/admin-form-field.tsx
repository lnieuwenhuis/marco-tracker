type AdminFormFieldProps = {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  step?: string;
  required?: boolean;
};

export function AdminFormField({
  label,
  name,
  defaultValue,
  type = "text",
  step,
  required = false,
}: AdminFormFieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-strong)]">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        step={step}
        required={required}
        className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-app-bg)] px-4 py-3 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-accent)]"
      />
    </label>
  );
}
