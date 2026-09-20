import type { Metadata } from "next";

import { UpdatePasswordForm } from "@/components/auth/reset-forms";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function NewPasswordPage() {
  return <UpdatePasswordForm />;
}
