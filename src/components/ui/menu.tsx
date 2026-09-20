"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** Menu desplegable ligero con cierre por click fuera y Escape. */
export function Menu({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open ? (
        <div
          role="menu"
          className={cn(
            "bg-surface card-shadow-lg ring-line absolute z-40 mt-1.5 min-w-48 rounded-xl p-1 ring-1",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  className,
  destructive,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition",
        destructive
          ? "text-red-600 hover:bg-red-50"
          : "text-ink-700 hover:bg-canvas hover:text-ink-900",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-ink-400 px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
      {children}
    </p>
  );
}

export function MenuSeparator() {
  return <div className="bg-line my-1 h-px" />;
}
