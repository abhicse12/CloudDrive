import { adminService } from '../services/admin.service.js';
import { toAdminUserDto } from '../utils/dto.js';

export const adminController = {
  async listUsers(req, res) {
    const { users, meta } = await adminService.listUsers(req.validated.query);
    res.json({ success: true, data: { users: users.map(toAdminUserDto) }, meta });
  },

  async updateUser(req, res) {
    const user = await adminService.updateUser(
      req.auth.userId,
      req.validated.params.id,
      req.validated.body,
    );
    res.json({ success: true, data: { user: toAdminUserDto(user) } });
  },
};
