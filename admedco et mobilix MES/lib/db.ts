import { PrismaClient } from "../generated/prisma";

/**
 * Next.js reloads modules on every edit in development, which would otherwise
 * open a new SQLite connection each time and eventually exhaust the file lock.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

