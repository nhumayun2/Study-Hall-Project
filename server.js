import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import app, { server } from "./src/app.js";
import dbConnection from "./config/db.config.js";

const PORT = process.env.PORT || 8001;

// const server = createServer(app);

// ioHandler(server);

server.listen(PORT, async () => {
  await dbConnection();
  console.log(`Server running at http://localhost:${PORT}`);
});
