// Runs the app's own repository calls for the hot pages against clouddrive_perf, so
// Postgres logs the exact SQL Prisma generates. Usage: node capture.mjs <server-src-url>
const src = process.argv[2];
const H = '00000000-0000-4000-8000-000000000001';
const load = (p) => import(new URL(p, src).href);

const { prisma } = await load('config/prisma.js');
const { fileRepository } = await load('repositories/file.repository.js');
const { shareRepository } = await load('repositories/share.repository.js');
const { adminRepository } = await load('repositories/admin.repository.js');
const { dashboardRepository } = await load('repositories/dashboard.repository.js');
const { trashService } = await load('services/trash.service.js');

const folder = await prisma.folder.findFirst({ where: { userId: H }, select: { id: true } });
const byName = [{ originalName: 'asc' }, { id: 'asc' }];
// A typical user (~50 files), whose plans can differ from the heavy user's.
const S = (await prisma.user.findFirst({ where: { email: 'user777@example.com' } })).id;
const page = { skip: 0, take: 50 };

const steps = {
  'files: root listing': () => fileRepository.list(H, { folderId: null, orderBy: byName, ...page }),
  'files: one folder': () =>
    fileRepository.list(H, { folderId: folder.id, orderBy: byName, ...page }),
  'files: search "report"': () =>
    fileRepository.list(H, { folderId: undefined, q: 'report', orderBy: byName, ...page }),
  'files: newest everywhere': () =>
    fileRepository.list(H, {
      folderId: undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...page,
    }),
  'trash page': () => trashService.list(H, { page: 1, pageSize: 50 }),
  'shares: active': () => shareRepository.list(H, { status: 'active', ...page }),
  'shares: all': () => shareRepository.list(H, { ...page }),
  'admin: users newest': () =>
    adminRepository.listUsers({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
    }),
  'admin: users search': () =>
    adminRepository.listUsers({
      q: 'user19',
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
    }),
  'admin: users by storage': () =>
    adminRepository.listUsers({
      orderBy: [{ storageUsed: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
    }),
  'admin: stats': () => adminRepository.stats(),
  'dashboard: stats': () => dashboardRepository.stats(H),
  'dashboard: recent': () => dashboardRepository.recentFiles(H, 8),
  'dashboard: activity': () => dashboardRepository.activity(H, { limit: 10 }),
  'small: root listing': () => fileRepository.list(S, { folderId: null, orderBy: byName, ...page }),
  'small: recent': () => dashboardRepository.recentFiles(S, 8),
  'small: shares all': () => shareRepository.list(S, { ...page }),
};

for (const [label, run] of Object.entries(steps)) {
  // A marker query, so the log can be split per step.
  await prisma.$executeRawUnsafe(`SELECT 1 /* STEP: ${label} */`);
  const t = performance.now();
  await run();
  console.log(`${label.padEnd(26)} ${(performance.now() - t).toFixed(1)} ms (app-side, 1st run)`);
}
await prisma.$disconnect();
