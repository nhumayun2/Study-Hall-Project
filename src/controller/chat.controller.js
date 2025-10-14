import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Chat } from "../model/chat.model.js";
import AppError from "../errors/AppError.js";

export const sendMessage = catchAsync(async (req, res) => {
  // FIX: Using 'message' field name to match the chat.model.js schema
  const { recipientId, message } = req.body;
  const senderId = req.user._id;

  if (!recipientId || !message) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Recipient ID and message content are required."
    );
  } // Check if a conversation already exists between the two users // NOTE: Your current model schema uses 'participants' array, but controller uses 'sender'/'recipient' fields. // Assuming your Chat model will be structured to support this controller logic (sender/recipient fields).

  const conversation = await Chat.findOne({
    $or: [
      { sender: senderId, recipient: recipientId },
      { sender: recipientId, recipient: senderId },
    ],
  });

  if (conversation) {
    // If conversation exists, add the new message to the messages array
    conversation.messages.push({
      sender: senderId,
      message, // FIX: Use 'message'
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
    // If no conversation exists, create a new one
    const newConversation = await Chat.create({
      // NOTE: Using sender/recipient fields based on your controller usage
      sender: senderId,
      recipient: recipientId,
      messages: [{ sender: senderId, message, timestamp: new Date() }], // FIX: Use 'message'
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
  const userId = req.user._id; // Populate the sender of each message

  const conversation = await Chat.findOne({
    $or: [
      { sender: userId, recipient: recipientId },
      { sender: recipientId, recipient: userId },
    ],
  }).populate("messages.sender", "name avatar"); // Corrected path for population

  if (!conversation) {
    throw new AppError(httpStatus.NOT_FOUND, "Conversation not found.");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Conversation history fetched successfully.",
    data: conversation,
  });
});

export const getMyConversations = catchAsync(async (req, res) => {
  const userId = req.user._id;

  const conversations = await Chat.find({
    $or: [{ sender: userId }, { recipient: userId }],
  })
    .populate("sender", "name avatar")
    .populate("recipient", "name avatar")
    .sort({ createdAt: -1 }); // Sort by conversation creation time (safer than deep message sort)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User conversations fetched successfully.",
    data: conversations,
  });
});
