import { publicShareService } from '../services/publicShare.service.js';

export const publicShareController = {
  async describe(req, res) {
    const share = await publicShareService.describe(req.validated.params.token);
    res.json({ success: true, data: { share } });
  },

  /** Always a redirect: the page links straight here (<a href>), no JavaScript needed. */
  async download(req, res) {
    const link = await publicShareService.downloadUrl(
      req.validated.params.token,
      req.validated.query,
    );
    res.redirect(302, link.url);
  },
};
