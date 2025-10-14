import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
const dbConnection = async () => {
  try {
    await mongoose.connect(process.env.MongoDB_URI);
    console.log("db connection successful");
  } catch (error) {
    console.error("db connection failed", error);
    process.exit(1);
  }
};

export default dbConnection;
