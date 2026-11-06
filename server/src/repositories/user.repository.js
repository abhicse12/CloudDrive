import { prisma } from '../config/prisma.js';

// All database access for users goes through here, so queries live in one place.
// Methods that may run inside a transaction take an optional `db` (the transaction client).
export const userRepository = {
  findById(id) {
    return prisma.user.findUnique({ where: { id } });
  },

  // Emails are stored lower-cased, so callers must pass a lower-cased email.
  findByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  },

  create(data) {
    return prisma.user.create({ data });
  },

  update(id, data, db = prisma) {
    return db.user.update({ where: { id }, data });
  },
};
