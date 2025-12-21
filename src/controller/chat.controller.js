import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Chat } from "../model/chat.model.js";
import { User } from "../model/user.model.js"; // Import User model for manual population
import AppError from "../errors/AppError.js";
import mongoose from "mongoose";

export const sendMessage = catchAsync(async (req, res) => {
  const { recipientId, message } = req.body;
  const senderId = req.user._id;

  if (!recipientId || !message) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Recipient ID and message content are required."
    );
  }

  const senderObjectId = new mongoose.Types.ObjectId(senderId);
  const recipientObjectId = new mongoose.Types.ObjectId(recipientId);

  let conversation = await Chat.findOne({
    participants: { $all: [senderObjectId, recipientObjectId] },
  });

  if (conversation) {
    conversation.messages.push({
      sender: senderId,
      message,
      timestamp: new Date(),
    });
    await conversation.save();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Message sent successfully (conversation updated).",
      data: conversation,
    });
  } else {
    const newConversation = await Chat.create({
      participants: [senderObjectId, recipientObjectId],
      messages: [{ sender: senderId, message, timestamp: new Date() }],
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "New conversation created and message sent successfully.",
      data: newConversation,
    });
  }
});

export const getConversationHistory = catchAsync(async (req, res) => {
  const { recipientId } = req.params;
  const userId = req.user._id;

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const recipientObjectId = new mongoose.Types.ObjectId(recipientId);

  // Find the conversation without populating messages initially
  const conversation = await Chat.findOne({
    participants: { $all: [userObjectId, recipientObjectId] },
  }).lean(); // Use .lean() for potentially faster read and easier modification

  if (!conversation) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Conversation history fetched successfully.",
      data: { participants: [userId, recipientId], messages: [] },
    });
  }

  // --- THIS IS THE FIX ---
  // Manually populate sender details for each message
  const populatedMessages = await Promise.all(
    conversation.messages.map(async (msg) => {
      const senderDetails = await User.findById(msg.sender)
        .select("name avatar")
        .lean();
      return {
        ...msg, // Spread the original message properties
        sender: senderDetails, // Replace the sender ID with the populated object
      };
    })
  );
  // --- END FIX ---

  // Replace the original messages with the populated ones
  conversation.messages = populatedMessages;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Conversation history fetched successfully.",
    data: conversation,
  });
});

export const getMyConversations = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const conversations = await Chat.find({
    participants: userObjectId,
  })
    .populate("participants", "name avatar")
    .sort({ updatedAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User conversations fetched successfully.",
    data: conversations,
  });
});
