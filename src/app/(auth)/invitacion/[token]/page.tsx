import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";

import { AcceptInvitation } from "@/components/team/accept-invitation";
import { AuthHeader } from "@/components/auth/form-shell";
import { roleMeta } from "@/lib/domain/roles";
import { getSessionContext } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invitación" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("invitation_preview", { p_token: token });
  const invitation = data?.[0];

  if (!invitation) {
    return (
      <div className="text-center">
        <AuthHeader
          title="Invitación no valida"
          subtitle="El enlace ha caducado o ya se ha utilizado. Pide una invitación nueva a tu equipo."
        />
        <Link href="/login" className="text-brand-600 text-[13px] font-medium hover:underline">
          Ir al inicio de sesión
        </Link>
      </div>
    );
  }

  const session = await getSessionContext();

  if (!session) {
    redirect(`/login?next=/invitacion/${token}`);
  }

  const emailMatches = session.email.toLowerCase() === invitation.email.toLowerCase();

  return (
    <div>
      <span className="bg-brand-50 text-brand-600 mb-4 grid size-12 place-items-center rounded-full">
        <UserPlus className="size-6" aria-hidden />
      </span>
      <AuthHeader
        title={`Unete a ${invitation.workspace_name}`}
        subtitle={
          <>
            Te han invitado como{" "}
            <strong className="text-ink-700">{roleMeta(invitation.role).label}</strong>.
          </>
        }
      />

      {emailMatches ? (
        <AcceptInvitation token={token} />
      ) : (
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 ring-1 ring-amber-100">
          Esta invitación es para <strong>{invitation.email}</strong> y has entrado como{" "}
          <strong>{session.email}</strong>. Cierra sesión y vuelve a abrir el enlace con la cuenta
          correcta.
        </div>
      )}
    </div>
  );
}
