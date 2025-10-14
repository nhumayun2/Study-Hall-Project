import express from "express";
import {
  getAllTutorApplications,
  getTutorApplicationDetails,
  approveTutorApplication,
  rejectTutorApplication,
} from "../controller/admin.application.controller.js";

const applicationRouter = express.Router();

// Get list of all tutor applications (filterable by status)
applicationRouter.get("/tutor", getAllTutorApplications);

// Get details of a specific tutor application
applicationRouter.get("/tutor/:applicationId", getTutorApplicationDetails);

// Approve a tutor application (promotes user to Tutor role)
applicationRouter.patch(
  "/tutor/:applicationId/approve",
  approveTutorApplication
);

// Reject a tutor application
applicationRouter.patch("/tutor/:applicationId/reject", rejectTutorApplication);

export default applicationRouter;
