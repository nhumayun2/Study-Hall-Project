import dotenv from 'dotenv';
dotenv.config(); // This MUST be the first thing that runs

import http from 'http';
import { Server } from 'socket.io';
import app from './src/app.js';
import dbConnection from './config/db.config.js';

const PORT = process.env.PORT || 8001;

// --- Server and WebSocket Setup ---
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// WebSocket connection logic
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


// --- Start the server ---
server.listen(PORT, async () => {
  await dbConnection();
  console.log(`Server running at http://localhost:${PORT}`);
});

