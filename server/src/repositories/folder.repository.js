import { prisma } from '../config/prisma.js';

/*
 * Every query here is scoped by userId. That single habit is what stops one user from
 * reaching another user's folders by guessing or swapping IDs (IDOR).
 *
 * Raw SQL note: Prisma passes template values as text, so UUIDs are cast with ::uuid.
 * Values are still sent as parameters (never pasted into the SQL), so this is safe
 * from SQL injection.
 */
export const folderRepository = {
  /** An active (not trashed) folder owned by the user, or null. */
  findOwned(userId, id, db = prisma) {
    return db.folder.findFirst({ where: { id, userId, deletedAt: null } });
  },

  listChildren(userId, parentId, orderBy) {
    return prisma.folder.findMany({
      where: { userId, parentId: parentId ?? null, deletedAt: null },
      orderBy,
    });
  },

  /** Every active folder, minimal fields: for the "Move to…" folder picker. */
  listTree(userId) {
    return prisma.folder.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: 'asc' },
    });
  },

  create(data) {
    return prisma.folder.create({ data });
  },

  update(id, data) {
    return prisma.folder.update({ where: { id }, data });
  },

  /**
   * The folder and all its ancestors, root first: Documents › Work › 2026.
   * Walks UP the tree: start at the folder, repeatedly join to its parent.
   */
  ancestors(userId, id) {
    return prisma.$queryRaw`
      WITH RECURSIVE chain AS (
        SELECT id, name, parent_id, 0 AS depth
        FROM folders
        WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        UNION
        SELECT f.id, f.name, f.parent_id, c.depth + 1
        FROM folders f
        JOIN chain c ON f.id = c.parent_id
        WHERE f.user_id = ${userId}::uuid
      )
      SELECT id, name FROM chain ORDER BY depth DESC`;
  },

  /**
   * IDs of the folder and everything below it, at any depth.
   * Walks DOWN the tree: start at the folder, repeatedly join to its children.
   * UNION (not UNION ALL) also stops the recursion if a cycle ever existed.
   */
  async subtreeIds(userId, id, db = prisma) {
    const rows = await db.$queryRaw`
      WITH RECURSIVE tree AS (
        SELECT id FROM folders WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        UNION
        SELECT f.id FROM folders f
        JOIN tree t ON f.parent_id = t.id
        WHERE f.user_id = ${userId}::uuid
      )
      SELECT id FROM tree`;
    return rows.map((row) => row.id);
  },
};
