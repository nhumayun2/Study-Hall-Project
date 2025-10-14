import mongoose from "mongoose";

/**
 * @description Schema for global application settings.
 * This model uses a singleton pattern, meaning there will only ever be one
 * document in this collection, identified by a unique key. This makes it easy
 * to fetch and update global configurations for the entire application.
 */
const settingsSchema = new mongoose.Schema(
  {
    // Unique key to ensure we only ever have one settings document.
    key: {
      type: String,
      required: true,
      default: "GLOBAL_SETTINGS",
      unique: true,
    },

    // --- Financial Configuration ---
    // Corresponds to the "Profit Distribution Settings" in the admin panel.
    profitDistribution: {
      platform: { type: Number, default: 20, min: 0, max: 100 }, // Percentage
      tutor: { type: Number, default: 70, min: 0, max: 100 }, // Percentage
      locationOwner: { type: Number, default: 10, min: 0, max: 100 }, // Percentage
    },

    // Corresponds to the "Withdrawal Limit" settings in the admin panel.
    withdrawalLimits: {
      min: { type: Number, default: 20 },
      max: { type: Number, default: 1000 },
    },

    // --- System Configuration ---
    // Example field for placing the app in maintenance mode.
    isMaintenanceMode: {
      type: Boolean,
      default: false,
    },

    // Storing legal text like ToS and Privacy Policy in the database
    // allows admins to update it without needing a new code deployment.
    termsOfService: {
      type: String,
      default: "Please update the Terms of Service in the admin panel.",
    },
    privacyPolicy: {
      type: String,
      default: "Please update the Privacy Policy in the admin panel.",
    },
  },
  {
    timestamps: true,
  }
);

// --- STATIC METHOD ---
/**
 * @description A static helper method to safely retrieve the global settings document.
 * If the document doesn't exist, it creates the default one. This ensures
 * that other parts of the application can always get the settings without errors.
 */
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ key: "GLOBAL_SETTINGS" });
  if (!settings) {
    // If no settings document exists, create one with default values.
    settings = await this.create({ key: "GLOBAL_SETTINGS" });
  }
  return settings;
};

export const Settings = mongoose.model("Settings", settingsSchema);
