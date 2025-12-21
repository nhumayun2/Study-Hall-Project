import express from "express";
import {
  createLocation,
  updateMyLocation,
  getMyLocations,
  getAllLocations,
  getLocationDetails,
} from "../controller/location.controller.js";
import { getLocationOwnerHomepage } from "../controller/home.controller.js";
import { isLocationOwner, protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// ====================================================================
// --- PUBLIC ROUTES (for browsing locations) ---
// ====================================================================

// GET /api/v1/locations - Get all active and approved locations
router.get("/", getAllLocations);

// GET /api/v1/locations/:locationId - Get details of a single public location
router.get("/:locationId", getLocationDetails);

// ====================================================================
// --- LOCATION OWNER ROUTES (Protected) ---
// ====================================================================

// All routes below this point require the user to be authenticated.
router.use(protect);

router.get("/my-homepage", isLocationOwner, getLocationOwnerHomepage);

// GET /api/v1/locations/my-locations - Get all locations owned by the current user
router.get("/my-locations", isLocationOwner, getMyLocations);

// POST /api/v1/locations - Create a new location
router.post("/", isLocationOwner, upload.array("photos"), createLocation);

// PATCH /api/v1/locations/:locationId - Update a location owned by the current user
router.patch("/:locationId", isLocationOwner, updateMyLocation);

export default router;
