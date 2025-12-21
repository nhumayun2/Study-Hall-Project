import mongoose from "mongoose";

/**
 * @description Schema for session sub-categories (e.g., "Algebra" under "Math").
 * Each sub-category belongs to a parent category.
 */
const subCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Sub-category name is required."],
      unique: true,
      trim: true,
    },
    // This creates a direct link to the parent Category document.
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true, // Indexing this field is good practice for faster lookups.
    },
    // Field to track if the sub-category is active.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    // Ensures that the combination of a sub-category name and its parent category is unique.
    // For example, you can have "Drawing" under "Art" and "Drawing" under "Engineering",
    // but you cannot have two "Drawing" sub-categories under "Art".
    indexes: [{ fields: { name: 1, category: 1 }, unique: true }],
  }
);

export const SubCategory = mongoose.model("SubCategory", subCategorySchema);
