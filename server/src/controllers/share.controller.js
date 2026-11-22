import { shareService } from '../services/share.service.js';
import { toShareDto } from '../utils/dto.js';

export const shareController = {
  /** POST /api/files/:id/share. The URL (with the token) is in this response ONLY. */
  async create(req, res) {
    const { share, url } = await shareService.create(
      req.auth.userId,
      req.validated.params.id,
      req.validated.body,
    );
    res.status(201).json({ success: true, data: { share: toShareDto(share), url } });
  },

  async list(req, res) {
    const { shares, meta } = await shareService.list(req.auth.userId, req.validated.query);
    const now = new Date(); // one clock for the whole page
    res.json({ success: true, data: { shares: shares.map((s) => toShareDto(s, now)) }, meta });
  },

  async get(req, res) {
    const share = await shareService.get(req.auth.userId, req.validated.params.id);
    res.json({ success: true, data: { share: toShareDto(share) } });
  },

  async revoke(req, res) {
    await shareService.revoke(req.auth.userId, req.validated.params.id);
    res.status(204).end();
  },

  async regenerate(req, res) {
    const { share, url } = await shareService.regenerate(req.auth.userId, req.validated.params.id);
    res.status(201).json({ success: true, data: { share: toShareDto(share), url } });
  },
};
