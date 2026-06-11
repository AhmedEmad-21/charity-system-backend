const express = require("express");
const userController = require("../controllers/userController");
const authMW = require("../middlewares/authMW");
const checkRoleMW = require("../middlewares/checkRoleMW");
const { PERMISSIONS } = require("../middlewares/checkRoleMW");
const validateSchema = require("../middlewares/schemaValidatorMW");
const userValidate = require("../utils/userValidate");
const managedUserCreateValidate = require("../utils/managedUserCreateValidate");

const router = express.Router();

router.get(
  "/search",
  authMW,
  checkRoleMW(PERMISSIONS.MANAGE_USERS),
  userController.searchUsers,
);
router.get(
  "/filter",
  authMW,
  checkRoleMW(PERMISSIONS.MANAGE_USERS),
  userController.filterUsers,
);
router.post(
  "/managed-accounts",
  authMW,
  checkRoleMW(PERMISSIONS.MANAGE_USERS),
  validateSchema(managedUserCreateValidate),
  userController.createManagedUser,
);
router.get(
  "/",
  authMW,
  checkRoleMW(PERMISSIONS.MANAGE_USERS),
  userController.getAllUsers,
);
router.get(
  "/:id",
  authMW,
  checkRoleMW(PERMISSIONS.MANAGE_USERS),
  userController.getUserById,
);
router.put(
  "/:id",
  authMW,
  validateSchema(userValidate),
  userController.updateUser,
);
router.delete(
  "/:id",
  authMW,
  checkRoleMW(PERMISSIONS.MANAGE_USERS),
  userController.deleteUser,
);

module.exports = router;
