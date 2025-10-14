import express from "express";
import {
  getAllLocationsAdmin,
  getLocationDetailsAdmin,
  approveLocationAdmin,
  rejectLocationAdmin,
  toggleLocationActiveStatusAdmin,
} from "../controller/admin.location.controller.js";

const locationRouter = express.Router();

// NOTE: Authentication and Admin check middleware (protect, isAdmin)
// will be applied in the main admin.route.js file where this router is mounted.

// Get a list of all locations (with filtering, search, and pagination)
locationRouter.get("/", getAllLocationsAdmin);

// Get details of a specific location for review/detail view
locationRouter.get("/:locationId", getLocationDetailsAdmin);

// Approve a submitted location
locationRouter.patch("/:locationId/approve", approveLocationAdmin);

// Reject a submitted location (requires rejectionReason in body)
locationRouter.patch("/:locationId/reject", rejectLocationAdmin);

// Toggle a location's active/inactive status (requires isActive boolean in body)
locationRouter.patch(
  "/:locationId/toggle-active",
  toggleLocationActiveStatusAdmin
);

export default locationRouter;
