"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";

export function AuthHeader({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-ink-900 text-xl font-semibold">{title}</h1>
      <p className="text-ink-500 mt-1 text-[13px]">{subtitle}</p>
    </header>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-700 ring-1 ring-red-100"
    >
      <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function AuthFooterLink({
  text,
  href,
  linkText,
}: {
  text: string;
  href: string;
  linkText: string;
}) {
  return (
    <p className="text-ink-500 mt-6 text-center text-[13px]">
      {text}{" "}
      <Link href={href} className="text-brand-600 font-medium hover:underline">
        {linkText}
      </Link>
    </p>
  );
}
