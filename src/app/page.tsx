import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/session";

export default async function RootPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  redirect(session.workspace ? "/resumen" : "/bienvenida");
}
