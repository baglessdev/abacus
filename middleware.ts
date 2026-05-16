import { NextResponse, type NextRequest } from "next/server"

import { auth } from "@/lib/auth"

export const runtime = "nodejs"

function safeFromOrDashboard(pathname: string): string {
  if (!pathname.startsWith("/")) return "/dashboard"
  if (pathname.startsWith("//")) return "/dashboard"
  if (pathname.includes(":")) return "/dashboard"
  return pathname
}

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl
  const session = await auth()
  const authenticated = !!session?.user

  // Authenticated user touching /login or /signup → dashboard.
  if (authenticated && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  if (authenticated) {
    return NextResponse.next()
  }

  // Unauthenticated. /login and /signup are public.
  if (pathname === "/login" || pathname === "/signup") {
    return NextResponse.next()
  }

  // Unauthenticated visitor on a /dashboard/* route → redirect to /login?from=...
  const from = safeFromOrDashboard(pathname)
  const loginUrl = new URL("/login", req.url)
  loginUrl.searchParams.set("from", from)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/login", "/signup"],
}
