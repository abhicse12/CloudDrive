import { authService } from '../services/auth.service.js';
import { AUTH_COOKIES, clearAuthCookies, setAuthCookies } from '../utils/cookies.js';
import { toUserDto } from '../utils/dto.js';

// Controllers translate HTTP <-> service calls. No business rules live here.

function requestContext(req) {
  return { ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 512) };
}

function sendAuthResult(res, status, { user, tokens }) {
  setAuthCookies(res, tokens);
  // Tokens travel ONLY in HttpOnly cookies, never in the JSON body.
  res.status(status).json({ success: true, data: { user: toUserDto(user) } });
}

export const authController = {
  async register(req, res) {
    const result = await authService.register(req.validated.body, requestContext(req));
    sendAuthResult(res, 201, result);
  },

  async login(req, res) {
    const result = await authService.login(req.validated.body, requestContext(req));
    sendAuthResult(res, 200, result);
  },

  async refresh(req, res) {
    try {
      const result = await authService.refresh(req.cookies[AUTH_COOKIES.refresh]);
      sendAuthResult(res, 200, result);
    } catch (err) {
      // A dead refresh token is useless; remove the cookies so the browser stops sending them.
      clearAuthCookies(res);
      throw err;
    }
  },

  async logout(req, res) {
    await authService.logout(req.cookies[AUTH_COOKIES.refresh]);
    clearAuthCookies(res);
    res.status(204).end();
  },

  me(req, res) {
    res.json({ success: true, data: { user: toUserDto(req.user) } });
  },
};
