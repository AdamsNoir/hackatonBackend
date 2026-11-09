import { getRequestUser } from "../middlewares/auth.middleware";
import * as userService from "../services/user.service";
import { asyncHandler } from "../utils/asyncHandler";

// PATCH /users/me  -> updated user
export const updateMyProfile = asyncHandler(async (req, res) => {
  res.json(await userService.updateProfile(getRequestUser(req).id, req.body));
});
