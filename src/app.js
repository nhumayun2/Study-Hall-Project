import express from "express";
import cors from "cors";
import routes from "../mainroute/route.config.js";
import notFound from "../src/middleware/notFound.js";
import globalErrorHandler from "./middleware/globalErrorHandler.js";
import { Server } from "socket.io";
import { createServer } from "http";

const app = express();

const server = createServer(app);
export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// WebSocket connection
io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);

  socket.on("joinChatRoom", (userId) => {
    if (userId) {
      socket.join(`chat_${userId}`);
      console.log(`Client ${socket.id} joined user room: ${userId}`);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Middlewares
app.use(express.json());
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

// Routes
app.use("/api/v1", routes);

// Error handlers
app.use(globalErrorHandler);
app.use(notFound);

export default app;
export { server };
