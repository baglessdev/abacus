import prisma from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ data: { app: "ok", database: "ok" } }, { status: 200 })
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown"
    return Response.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: `Database is not reachable: ${reason}`,
        },
      },
      { status: 503 },
    )
  }
}
