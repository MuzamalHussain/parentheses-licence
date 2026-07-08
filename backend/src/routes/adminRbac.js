const express = require("express");
const router = express.Router();
const c = require("../controllers/adminRbacController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/", c.overview);
router.post("/teams", c.createTeam);
router.patch("/teams/:teamId", c.updateTeam);
router.post("/teams/:teamId/archive", c.archiveTeam);
router.delete("/teams/:teamId", c.deleteTeam);
router.post("/teams/:teamId/members", c.assignTeamMember);
router.delete("/teams/:teamId/members/:userId", c.removeTeamMember);

router.post("/roles", c.createRole);
router.post("/roles/:roleId/clone", c.cloneRole);
router.patch("/roles/:roleId", c.updateRole);
router.post("/roles/:roleId/archive", c.archiveRole);
router.delete("/roles/:roleId", c.deleteRole);
router.post("/members/:userId/roles", c.assignRole);
router.delete("/members/:userId/roles/:roleId", c.removeRole);
router.get("/members/:userId/permissions", c.resolvedPermissions);

module.exports = router;
