/**
 * Prisma's `contains` becomes LIKE '%<value>%' WITHOUT escaping, so a search for "%"
 * or "_" would act as a wildcard and match everything. Escape them (and the escape
 * character itself) so they're matched literally.
 */
export const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');
