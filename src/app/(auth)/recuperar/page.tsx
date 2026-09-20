import type { Metadata } from "next";

import { RequestResetForm } from "@/components/auth/reset-forms";

export const metadata: Metadata = { title: "Recuperar acceso" };

export default function RecoverPage() {
  return <RequestResetForm />;
}
