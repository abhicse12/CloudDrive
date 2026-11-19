import { dashboardService } from '../services/dashboard.service.js';
import { toActivityDto, toFileDto } from '../utils/dto.js';

export const dashboardController = {
  async stats(req, res) {
    const stats = await dashboardService.stats(req.auth.userId);
    res.json({ success: true, data: stats });
  },

  async recentFiles(req, res) {
    const files = await dashboardService.recentFiles(req.auth.userId, req.validated.query);
    res.json({ success: true, data: { files: files.map(toFileDto) } });
  },

  async activity(req, res) {
    const { limit } = req.validated.query;
    const entries = await dashboardService.activity(req.auth.userId, req.validated.query);
    // A full page means there may be more; a short page means we reached the end.
    const nextCursor = entries.length === limit ? entries.at(-1).id : null;
    res.json({ success: true, data: { activity: entries.map(toActivityDto), nextCursor } });
  },
};
