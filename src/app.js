import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import routes from "../mainroute/route.config.js";
import notFound from "./middleware/notFound.js";
import globalErrorHandler from "./middleware/globalErrorHandler.js";

const app = express();

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

// Root route
app.get("/", (req, res) => {
  res.status(200).json({ status: true, message: "Welcome to the server" });
});

// Main application routes
app.use("/api/v1", routes);

// Error handlers
app.use(globalErrorHandler);
app.use(notFound);

export default app;
