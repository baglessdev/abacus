// Auth.js v5 configuration — edge-safe.
//
// This file intentionally does NOT import Prisma or @node-rs/argon2. Those live in
// the real `authorize` callback, which is injected in `lib/auth/index.ts` before
// calling `NextAuth(config)`. This split keeps the door open to flipping the
// middleware back to the edge runtime in a future feature.

import type { NextAuthConfig } from "next-auth"

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    // The real Credentials provider is injected in lib/auth/index.ts —
    // it imports Prisma + the password helpers, which can't live here.
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        token.email = user.email ?? token.email
      }
      return token
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      if (token.email) session.user.email = token.email
      return session
    },
  },
} satisfies NextAuthConfig
