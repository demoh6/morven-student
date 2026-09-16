import { Prisma } from "@prisma/client";

/**
 * Idempotent, retry-safe create used by the guest → account migration.
 *
 * Phase 3 sends each local guest record with its stable local `id` as a
 * `clientId`. If a row for (userId, clientId) already exists (e.g. an earlier
 * migration attempt partially succeeded before the client could record it), we
 * return the existing row instead of creating a duplicate. A create race
 * against the unique (userId, clientId) index is resolved by re-reading the
 * winner. Records created outside a migration (no clientId) always create.
 */
export async function createWithClientId<T extends { id: string }>(
  findExisting: (clientId: string) => Promise<T | null>,
  create: () => Promise<T>,
  clientId?: string
): Promise<T> {
  if (!clientId) {
    return create();
  }

  const existing = await findExisting(clientId);
  if (existing) return existing;

  try {
    return await create();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await findExisting(clientId);
      if (winner) return winner;
    }
    throw err;
  }
}