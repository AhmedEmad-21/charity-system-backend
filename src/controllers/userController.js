const userService = require("../services/userService");
const { hasPermission, PERMISSIONS } = require("../middlewares/checkRoleMW");
const { parsePagination } = require("../utils/pagination");

const userController = {
  async getAllUsers(req, res, next) {
    try {
      const pagination = parsePagination(req.query || {}, {
        defaultLimit: 20,
        maxLimit: 100,
      });
      const data = await userService.fetchUsers(
        pagination.hasPagination ? pagination : {},
      );
      return res
        .status(200)
        .json({
          success: true,
          count: data.length,
          page: pagination.hasPagination ? pagination.page : undefined,
          limit: pagination.hasPagination ? pagination.limit : undefined,
          data,
        });
    } catch (error) {
      return next(error);
    }
  },

  async getUserById(req, res, next) {
    try {
      const data = await userService.fetchUserById(req.params.id);
      if (!data) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async updateUser(req, res, next) {
    try {
      const actorId = req.user?.id || req.user?._id || req.user?.userId || null;
      const isOwner = String(actorId) === String(req.params.id);
      const canManageUsers = hasPermission(
        req.user?.role,
        PERMISSIONS.MANAGE_USERS,
      );

      if (!isOwner && !canManageUsers) {
        return res
          .status(403)
          .json({
            success: false,
            message: "Forbidden: cannot update another user",
          });
      }

      const data = await userService.updateUserData(
        req.params.id,
        req.body || {},
      );
      if (!data) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },

  async deleteUser(req, res, next) {
    try {
      const data = await userService.deleteUserById(req.params.id);
      if (!data) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      return res
        .status(200)
        .json({ success: true, message: "User deleted successfully", data });
    } catch (error) {
      return next(error);
    }
  },

  async createManagedUser(req, res, next) {
    try {
      const actorUserID =
        req.user?.id || req.user?._id || req.user?.userId || null;
      const data = await userService.createManagedUser(
        req.body || {},
        actorUserID,
      );
      return res.status(201).json({
        success: true,
        message: "Managed account created successfully",
        data,
      });
    } catch (error) {
      return next(error);
    }
  },

  async searchUsers(req, res, next) {
    try {
      const keyword =
        req.query?.q || req.query?.keyword || req.query?.term || "";
      const pagination = parsePagination(req.query || {}, {
        defaultLimit: 20,
        maxLimit: 100,
      });
      const data = await userService.searchUsersLogic(
        keyword,
        pagination.hasPagination ? pagination : {},
      );
      return res
        .status(200)
        .json({
          success: true,
          count: data.length,
          page: pagination.hasPagination ? pagination.page : undefined,
          limit: pagination.hasPagination ? pagination.limit : undefined,
          data,
        });
    } catch (error) {
      return next(error);
    }
  },

  async filterUsers(req, res, next) {
    try {
      const pagination = parsePagination(req.query || {}, {
        defaultLimit: 20,
        maxLimit: 100,
      });
      const data = await userService.filterUsersLogic(
        req.query || {},
        pagination.hasPagination ? pagination : {},
      );
      return res
        .status(200)
        .json({
          success: true,
          count: data.length,
          page: pagination.hasPagination ? pagination.page : undefined,
          limit: pagination.hasPagination ? pagination.limit : undefined,
          data,
        });
    } catch (error) {
      return next(error);
    }
  },
};

module.exports = userController;
