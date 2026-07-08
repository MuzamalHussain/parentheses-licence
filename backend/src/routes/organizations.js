const express = require("express");
const router = express.Router();
const c = require("../controllers/organizationController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

router.get("/", c.listOrganizations);
router.post("/", c.createOrganization);
router.post("/invitations/accept", c.acceptInvitation);
router.post("/invitations/decline", c.declineInvitation);
router.post("/:organizationId/switch", c.switchOrganization);
router.get("/:organizationId/dashboard", c.dashboard);
router.patch("/:organizationId/settings", c.updateSettings);
router.post("/:organizationId/invitations", c.inviteMember);
router.post("/:organizationId/invitations/:invitationId/:action", c.invitationAction);
router.patch("/:organizationId/members/:userId/role", c.changeRole);
router.post("/:organizationId/members/:userId/suspend", c.suspendMember);
router.delete("/:organizationId/members/:userId", c.removeMember);
router.post("/:organizationId/transfer-ownership", c.transferOwnership);

module.exports = router;
