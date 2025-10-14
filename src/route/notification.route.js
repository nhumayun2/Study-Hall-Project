import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getMyNotifications,
  markNotificationAsRead,
  deleteNotification,
  sendTestNotification, // <-- New import
} from "../controller/notification.controller.js";

const router = express.Router();

// Public/Admin route to send a test notification (for debugging or admin panel)
router.post("/send-test", protect, sendTestNotification); // <-- New POST route

// User-specific routes
router.get("/my-notifications", protect, getMyNotifications);
router.patch("/mark-read/:id", protect, markNotificationAsRead);
router.delete("/delete/:id", protect, deleteNotification);

export default router;