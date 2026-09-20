"use client";

import Link from "next/link";
import { useActionState } from "react";

import { AuthFooterLink, AuthHeader, FormError } from "@/components/auth/form-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signInAction } from "@/server/actions/auth";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, null);
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      <AuthHeader
        title="Entra en tu estudio"
        subtitle="Gestiona la producción de tus canales con tu equipo."
      />

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next ?? ""} />

        {state && !state.ok ? <FormError message={state.error} /> : null}

        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tu@estudio.com"
            required
          />
        </Field>

        <Field label="Contraseña" htmlFor="password" error={fieldErrors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="********"
            required
          />
        </Field>

        <div className="flex justify-end">
          <Link href="/recuperar" className="text-ink-500 hover:text-brand-600 text-[13px]">
            He olvidado mi contraseña
          </Link>
        </div>

        <Button type="submit" size="lg" loading={pending} className="w-full justify-center">
          Entrar
        </Button>
      </form>

      <AuthFooterLink text="Todavía no tienes cuenta?" href="/registro" linkText="Crear cuenta" />
    </>
  );
}
