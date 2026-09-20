import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy-session";

/** Rutas accesibles sin sesión iniciada. */
const PUBLIC_PATHS = [
  "/login",
  "/registro",
  "/recuperar",
  "/nueva-password",
  "/invitacion",
  "/auth",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export default async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  // Un usuario con sesión no deberia ver login/registro.
  if (user && (pathname === "/login" || pathname === "/registro")) {
    const url = request.nextUrl.clone();
    url.pathname = "/resumen";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todas las rutas salvo estaticos y assets, para que la sesión se refresque
     * en cada navegacion real.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
