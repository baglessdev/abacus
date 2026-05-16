import type { User } from "@prisma/client"

import prisma from "@/lib/prisma"

export async function getUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } })
}

export async function createUser(input: { email: string; passwordHash: string }): Promise<User> {
  return prisma.user.create({ data: input })
}
