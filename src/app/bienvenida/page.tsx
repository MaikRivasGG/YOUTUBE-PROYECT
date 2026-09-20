import type { Metadata } from "next";

import { Onboarding } from "@/components/auth/onboarding";
import { Logo } from "@/components/brand";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Crear equipo" };

export default async function WelcomePage() {
  const session = await requireSession();

  return (
    <div className="bg-canvas flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-lg">
        <Logo size="lg" className="mb-8" />
        <Onboarding
          firstName={session.profile.full_name.split(" ")[0]}
          hasWorkspaces={session.workspaces.length > 0}
        />
      </div>
    </div>
  );
}
