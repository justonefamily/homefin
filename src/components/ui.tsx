"use client";
import type { ReactNode } from "react";

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const money = (n: number) => `${n < 0 ? "−" : ""}$${fmt(Math.abs(n))}`;
/** Alphabetical, case-insensitive — every category-style dropdown uses it. */
export const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const Card = ({ children, className, dark }: { children: ReactNode; className?: string; dark?: boolean }) => (
  <div className={cx("rounded-[16px] border", dark ? "bg-ink text-white border-ink" : "bg-card border-line", className)}>{children}</div>
);

export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex items-center justify-between">
    <h2 className="text-base font-semibold">{children}</h2>
    {action}
  </div>
);

export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx("text-[11px] font-bold uppercase tracking-[0.06em] text-muted", className)}>{children}</div>
);

export const Stat = ({ label, value, tone, dark, sub }: { label: string; value: string; tone?: "green" | "red" | "amber" | "teal"; dark?: boolean; /** small callout under the value, in the same tone */ sub?: string }) => (
  <div className={cx("rounded-[14px] border p-3 flex flex-col gap-0.5 min-w-0", dark ? "bg-ink border-ink text-white" : "bg-card border-line")}>
    <div className={cx("text-[11px]", dark ? "text-muted-3" : "text-muted")}>{label}</div>
    <div className={cx("text-[17px] font-bold truncate", tone === "green" && "text-green", tone === "red" && "text-red", tone === "amber" && "text-amber", tone === "teal" && "text-teal")}>{value}</div>
    {sub && <div className={cx("text-[11px] font-semibold rounded-[6px] px-1.5 py-0.5 self-start", tone === "red" ? "bg-red/10 text-red" : tone === "amber" ? "bg-amber-bg text-amber" : tone === "green" ? "bg-green/10 text-green" : "bg-surface text-muted")}>{sub}</div>}
  </div>
);

export const Segmented = <T extends string>({ value, onChange, options, size = "md" }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; size?: "sm" | "md" }) => (
  <div className="flex gap-1 rounded-[12px] bg-line p-1" role="tablist">
    {options.map((o) => (
      <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
        className={cx("flex-1 rounded-[9px] font-semibold transition-colors", size === "sm" ? "h-9 text-xs" : "h-10 text-[13px]", value === o.id ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink")}>
        {o.label}
      </button>
    ))}
  </div>
);

export const Button = ({ children, onClick, variant = "primary", className, type = "button", disabled }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "dashed" | "danger"; className?: string; type?: "button" | "submit"; disabled?: boolean }) => (
  <button type={type} onClick={onClick} disabled={disabled}
    className={cx("h-11 px-4 rounded-[12px] text-[13px] font-semibold transition-colors disabled:opacity-50",
      variant === "primary" && "bg-accent text-white hover:bg-accent-deep",
      variant === "secondary" && "bg-card border border-line text-ink hover:border-field",
      variant === "ghost" && "text-accent hover:bg-accent-bg",
      variant === "dashed" && "border border-dashed border-field text-accent hover:bg-accent-bg w-full",
      variant === "danger" && "bg-card border border-line text-red hover:bg-red/5",
      className)}>
    {children}
  </button>
);

export const ProgressBar = ({ pct, color = "bg-accent", track = "bg-line-soft", h = "h-2", marker }: { pct: number; color?: string; track?: string; h?: string; marker?: number }) => (
  <div className={cx("relative w-full rounded-full overflow-visible", track, h)}>
    <div className={cx("rounded-full", color, h)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    {marker !== undefined && <div className="absolute -top-[3px] w-0.5 h-[14px] bg-ink" style={{ left: `${marker}%` }} aria-hidden />}
  </div>
);

export const Row = ({ left, title, sub, right, rightSub, rightTone, onClick }: { left?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; rightSub?: ReactNode; rightTone?: string; onClick?: () => void }) => {
  const inner = (
    <>
      {left}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
        <div className="text-sm font-semibold truncate">{title}</div>
        {sub && <div className="text-xs text-muted truncate">{sub}</div>}
      </div>
      {(right || rightSub) && (
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {right && <div className="text-sm font-semibold">{right}</div>}
          {rightSub && <div className={cx("text-[11px] font-semibold", rightTone ?? "text-muted")}>{rightSub}</div>}
        </div>
      )}
    </>
  );
  const cls = "flex items-center gap-3 px-4 py-3 border-b border-line-soft last:border-b-0 w-full";
  return onClick ? <button onClick={onClick} className={cx(cls, "hover:bg-surface/60 min-h-16")}>{inner}</button> : <div className={cls}>{inner}</div>;
};

export const Mark = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx("w-10 h-10 rounded-[10px] bg-line-soft flex items-center justify-center text-xs font-bold text-ink-3 shrink-0 overflow-hidden", className)}>{children}</div>
);

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold text-muted">{label}</span>
    {children}
    {hint && <span className="text-[11px] text-muted-2">{hint}</span>}
  </label>
);

export const inputCls = "h-11 w-full rounded-[12px] border border-chip bg-card px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";
export const selectCls = inputCls + " appearance-none pr-9 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%235B6270%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_12px_center]";

export const Empty = ({ title, body, action }: { title: string; body: string; action?: ReactNode }) => (
  <Card className="p-6 flex flex-col items-center text-center gap-3">
    <div className="text-base font-semibold">{title}</div>
    <div className="text-sm text-muted max-w-sm">{body}</div>
    {action}
  </Card>
);

export const Modal = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full sm:max-w-md bg-card rounded-t-[20px] sm:rounded-[20px] p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto [&>*]:shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full hover:bg-surface flex items-center justify-center text-muted">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};
