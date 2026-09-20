"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";

import { AuthFooterLink, AuthHeader, FormError } from "@/components/auth/form-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { signUpAction } from "@/server/actions/auth";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, null);
  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Cuando el proyecto exige confirmar el email la accion vuelve con ok.
  if (state?.ok) {
    return (
      <div className="text-center">
        <span className="bg-brand-50 text-brand-600 mx-auto mb-4 grid size-12 place-items-center rounded-full">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <h1 className="text-ink-900 text-xl font-semibold">Revisa tu correo</h1>
        <p className="text-ink-500 mt-2 text-[13px]">
          Te hemos enviado un enlace para confirmar la cuenta. Al abrirlo entraras directamente en
          tu estudio.
        </p>
      </div>
    );
  }

  return (
    <>
      <AuthHeader title="Crea tu estudio" subtitle="Dos minutos y tu equipo ya puede trabajar." />

      <form action={formAction} className="space-y-4" noValidate>
        {state && !state.ok ? <FormError message={state.error} /> : null}

        <Field label="Nombre y apellidos" htmlFor="fullName" error={fieldErrors.fullName}>
          <Input
            id="fullName"
            name="fullName"
            autoComplete="name"
            placeholder="Clara Martin"
            required
          />
        </Field>

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

        <Field
          label="Contraseña"
          htmlFor="password"
          error={fieldErrors.password}
          hint="Mínimo 8 caracteres."
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>

        <Button type="submit" size="lg" loading={pending} className="w-full justify-center">
          Crear cuenta
        </Button>
      </form>

      <AuthFooterLink text="Ya tienes cuenta?" href="/login" linkText="Entrar" />
    </>
  );
}
