import express from "express";
import {
  getAllTransactionsAdmin,
  getTransactionDetailsAdmin,
  processRefundAdmin,
} from "../controller/admin.transaction.controller.js";

const transactionRouter = express.Router();

// NOTE: Authentication and Admin check middleware (protect, isAdmin)
// will be applied in the main admin.route.js file where this router is mounted.

// Get a list of all transactions (payments, refunds, etc.)
transactionRouter.get("/", getAllTransactionsAdmin);

// Get details of a specific transaction for the modal view
transactionRouter.get("/:transactionId", getTransactionDetailsAdmin);

// Process a refund for a completed transaction
transactionRouter.patch("/:transactionId/refund", processRefundAdmin);

export default transactionRouter;
