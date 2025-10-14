import express from "express";
import {
  getProfitMetricsAdmin,
  getAllProfitTransactionsAdmin,
  getProfitDetailsAdmin,
} from "../controller/admin.profit.controller.js";

const profitRouter = express.Router();

// NOTE: Authentication and Admin check middleware (protect, isAdmin)
// will be applied in the main admin.route.js file where this router is mounted.

// Route to get the summary metrics (Total, Platform, Tutor, Landlord Profit)
profitRouter.get("/metrics", getProfitMetricsAdmin);

// Route to get the paginated list of profit transactions (the main table)
profitRouter.get("/", getAllProfitTransactionsAdmin);

// Route to get the detail view of a single profit transaction (the modal)
profitRouter.get("/:transactionId", getProfitDetailsAdmin);

export default profitRouter;
