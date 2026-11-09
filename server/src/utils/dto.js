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

export function toFolderDto(folder) {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}
