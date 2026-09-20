"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";

import { AuthFooterLink, AuthHeader, FormError } from "@/components/auth/form-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { requestPasswordResetAction, updatePasswordAction } from "@/server/actions/auth";

export function RequestResetForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, null);

  if (state?.ok) {
    return (
      <div className="text-center">
        <span className="bg-brand-50 text-brand-600 mx-auto mb-4 grid size-12 place-items-center rounded-full">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h1 className="text-ink-900 text-xl font-semibold">Enlace enviado</h1>
        <p className="text-ink-500 mt-2 text-[13px]">
          Si ese email tiene cuenta, recibiras un enlace para elegir una contraseña nueva.
        </p>
        <AuthFooterLink text="" href="/login" linkText="Volver a entrar" />
      </div>
    );
  }

  return (
    <>
      <AuthHeader
        title="Recuperar acceso"
        subtitle="Te enviamos un enlace para crear una contraseña nueva."
      />
      <form action={formAction} className="space-y-4" noValidate>
        {state && !state.ok ? <FormError message={state.error} /> : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Button type="submit" size="lg" loading={pending} className="w-full justify-center">
          Enviar enlace
        </Button>
      </form>
      <AuthFooterLink text="Te has acordado?" href="/login" linkText="Entrar" />
    </>
  );
}

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePasswordAction, null);
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <>
      <AuthHeader title="Nueva contraseña" subtitle="Elige una contraseña y entraras al estudio." />
      <form action={formAction} className="space-y-4" noValidate>
        {state && !state.ok ? <FormError message={state.error} /> : null}
        <Field label="Contraseña" htmlFor="password" error={fieldErrors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Repite la contraseña" htmlFor="confirm" error={fieldErrors.confirm}>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" size="lg" loading={pending} className="w-full justify-center">
          Guardar y entrar
        </Button>
      </form>
    </>
  );
}
