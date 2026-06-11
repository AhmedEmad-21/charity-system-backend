const express = require("express");
const userController = require("../controllers/userController");
const developerAccessMW = require("../middlewares/developerAccessMW");
const validateSchema = require("../middlewares/schemaValidatorMW");
const managedUserCreateValidate = require("../utils/managedUserCreateValidate");

const router = express.Router();

router.use(developerAccessMW);

router.post(
  "/managed-accounts",
  validateSchema(managedUserCreateValidate),
  userController.createManagedUser,
);

module.exports = router;
