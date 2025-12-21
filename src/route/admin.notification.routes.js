import express from "express";
import {
  createNotification,
  getAllNotifications,
  getNotificationDetails,
  updateNotification,
  deleteNotification,
} from "../controller/admin.notification.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect, isAdmin);

router.post("/", createNotification);

router.get("/", getAllNotifications);

router.get("/:id", getNotificationDetails);

router.patch("/:id", updateNotification);

router.delete("/:id", deleteNotification);

export default router;