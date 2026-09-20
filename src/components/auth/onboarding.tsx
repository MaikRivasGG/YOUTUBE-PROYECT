"use client";

import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/auth/form-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { createWorkspaceAction, seedDemoWorkspaceAction } from "@/server/actions/workspace";

export function Onboarding({
  firstName,
  hasWorkspaces,
}: {
  firstName: string;
  hasWorkspaces: boolean;
}) {
  const [state, formAction, pending] = useActionState(createWorkspaceAction, null);
  const [seeding, startSeed] = useTransition();
  const router = useRouter();

  return (
    <Card className="p-6">
      {hasWorkspaces ? (
        <Link
          href="/resumen"
          className="text-ink-500 hover:text-ink-900 mb-4 inline-flex items-center gap-1.5 text-[13px]"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Volver al estudio
        </Link>
      ) : null}

      <h1 className="text-ink-900 text-xl font-semibold">
        Hola {firstName}, crea tu espacio de trabajo
      </h1>
      <p className="text-ink-500 mt-1 text-[13px]">
        Un espacio agrupa tus canales, tu equipo y todo el pipeline de producción.
      </p>

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        {state && !state.ok ? <FormError message={state.error} /> : null}

        <Field
          label="Nombre del equipo"
          htmlFor="name"
          error={state && !state.ok ? state.fieldErrors?.name : undefined}
        >
          <Input id="name" name="name" placeholder="Equipo principal" required maxLength={60} />
        </Field>

        <Button type="submit" size="lg" loading={pending} className="w-full justify-center">
          Crear equipo
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="bg-line h-px flex-1" />
        <span className="text-ink-400 text-[11px] font-medium tracking-wide uppercase">o</span>
        <span className="bg-line h-px flex-1" />
      </div>

      <Button
        variant="secondary"
        size="lg"
        className="w-full justify-center"
        loading={seeding}
        onClick={() =>
          startSeed(async () => {
            const result = await seedDemoWorkspaceAction();
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success("Equipo de demostracion listo");
            router.push("/produccion");
            router.refresh();
          })
        }
      >
        <Sparkles className="size-4" aria-hidden />
        Probar con datos de ejemplo
      </Button>
      <p className="text-ink-400 mt-2 text-center text-[12px]">
        Crea 4 canales y 10 videos repartidos por el pipeline para que veas el tablero funcionando.
      </p>
    </Card>
  );
}
