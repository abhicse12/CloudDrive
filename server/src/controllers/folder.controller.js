import { folderService } from '../services/folder.service.js';
import { toFolderDto } from '../utils/dto.js';

export const folderController = {
  async list(req, res) {
    const folders = await folderService.list(req.auth.userId, req.validated.query);
    res.json({ success: true, data: { folders: folders.map(toFolderDto) } });
  },

  async tree(req, res) {
    const folders = await folderService.listTree(req.auth.userId);
    res.json({ success: true, data: { folders } });
  },

  async get(req, res) {
    const { folder, breadcrumbs } = await folderService.get(
      req.auth.userId,
      req.validated.params.id,
    );
    res.json({ success: true, data: { folder: toFolderDto(folder), breadcrumbs } });
  },

  async create(req, res) {
    const folder = await folderService.create(req.auth.userId, req.validated.body);
    res.status(201).json({ success: true, data: { folder: toFolderDto(folder) } });
  },

  async update(req, res) {
    const folder = await folderService.update(
      req.auth.userId,
      req.validated.params.id,
      req.validated.body,
    );
    res.json({ success: true, data: { folder: toFolderDto(folder) } });
  },
};
