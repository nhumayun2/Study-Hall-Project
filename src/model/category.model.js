import mongoose from "mongoose";

/**
 * @description Schema for session categories (e.g., "Math", "Art", "Music").
 * These are managed by the Admin in the settings panel.
 */
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required."],
      unique: true,
      trim: true,
    },
    // The icon is used in the student-facing app's homepage.
    icon: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    // Field to track if the category is active and should be shown to users.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Category = mongoose.model("Category", categorySchema);
