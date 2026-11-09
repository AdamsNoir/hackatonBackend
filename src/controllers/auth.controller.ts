import { getRequestUser } from "../middlewares/auth.middleware";
import * as authService from "../services/auth.service";
import { asyncHandler } from "../utils/asyncHandler";

/* Auth controller: body is already validated by the routes (validateBody). */

// POST /auth/register  -> { token, user }
export const register = asyncHandler(async (req, res) => {
  res.status(201).json(await authService.register(req.body));
});

// POST /auth/login  -> { token, user }
export const login = asyncHandler(async (req, res) => {
  res.json(await authService.login(req.body));
});

// GET /auth/me  -> user
export const me = asyncHandler(async (req, res) => {
  res.json(await authService.getCurrentUser(getRequestUser(req).id));
});

// POST /auth/change-password  -> { token, user }
export const changePassword = asyncHandler(async (req, res) => {
  res.json(await authService.changePassword(getRequestUser(req).id, req.body));
});

// POST /auth/logout  (logs out of every device)
export const logout = asyncHandler(async (req, res) => {
  await authService.logoutEverywhere(getRequestUser(req).id);
  res.status(204).send();
});
