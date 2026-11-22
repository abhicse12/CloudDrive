/**
 * DTO = Data Transfer Object: the exact shape the API sends to clients.
 * Fields are listed explicitly (allow-list), so a new database column such as
 * passwordHash can never leak just because someone forgot to delete it.
 */
export function toUserDto(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    // BigInt can't be JSON-serialised; Number is exact up to 9 PB.
    storageUsed: Number(user.storageUsed),
    storageLimit: Number(user.storageLimit),
    createdAt: user.createdAt,
  };
}

/** storageKey and status stay server-side: clients use the file ID and API endpoints. */
export function toFileDto(file) {
  return {
    id: file.id,
    name: file.originalName,
    folderId: file.folderId,
    mimeType: file.mimeType,
    category: file.category,
    size: Number(file.sizeBytes),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    // null unless in trash
    deletedAt: file.deletedAt,
    // Has at least one working share link. Queries that list files include the count of
    // active shares (fileRepository.withShareCount); without it the answer is false.
    isShared: (file._count?.shares ?? 0) > 0,
  };
}

/** 'active' | 'expired' | 'revoked'. Revoked wins: a revoked link stays revoked. */
export function shareStatus(share, now = new Date()) {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && share.expiresAt <= now) return 'expired';
  return 'active';
}

/**
 * tokenHash is never sent: the token itself is shown once, at creation, and the hash is
 * useless to clients. `fileAvailable` is false while the file is in trash (the link is
 * paused: it works again if the file is restored and the link hasn't expired).
 */
export function toShareDto(share, now = new Date()) {
  const { file } = share;
  return {
    id: share.id,
    status: shareStatus(share, now),
    expiresAt: share.expiresAt,
    revokedAt: share.revokedAt,
    accessCount: share.accessCount,
    lastAccessedAt: share.lastAccessedAt,
    createdAt: share.createdAt,
    fileAvailable: file.deletedAt === null,
    file: {
      id: file.id,
      name: file.originalName,
      mimeType: file.mimeType,
      category: file.category,
      size: Number(file.sizeBytes),
    },
  };
}

export function toFolderDto(folder) {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    deletedAt: folder.deletedAt,
  };
}

/** metadata is a snapshot written by our own services (names, sizes), never user JSON. */
export function toActivityDto(entry) {
  return {
    id: entry.id,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ?? {},
    createdAt: entry.createdAt,
  };
}
