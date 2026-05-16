import NextAuth, { type DefaultSession } from "next-auth"
import "next-auth/jwt"
import Credentials from "next-auth/providers/credentials"

import { authConfig } from "@/lib/auth/config"
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password"
import { loginSchema } from "@/lib/auth/schemas"
import { getUserByEmail } from "@/lib/auth/user"

export const { auth, signIn, signOut, handlers } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const user = await getUserByEmail(email)

        if (!user) {
          // Timing parity: spend the same Argon2 verify cycle whether the
          // email exists or not, so unknown-email and wrong-password are
          // indistinguishable.
          await verifyPassword(password, DUMMY_HASH)
          return null
        }

        const ok = await verifyPassword(password, user.passwordHash)
        if (!ok) return null

        return { id: user.id, email: user.email }
      },
    }),
  ],
})

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    email: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub: string
    email: string
  }
}
