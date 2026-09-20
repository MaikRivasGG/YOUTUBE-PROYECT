"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "@/server/actions/team";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="lg"
      className="w-full justify-center"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await acceptInvitationAction(token);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Ya formas parte del equipo");
          router.replace("/resumen");
          router.refresh();
        })
      }
    >
      Aceptar invitación
    </Button>
  );
}
