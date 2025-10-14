import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  sendMessage,
  getConversationHistory,
  getMyConversations,
} from "../controller/chat.controller.js";

const router = express.Router();

router.post("/", protect, sendMessage);
router.get("/", protect, getMyConversations);
router.get("/:recipientId", protect, getConversationHistory);

export default router;
