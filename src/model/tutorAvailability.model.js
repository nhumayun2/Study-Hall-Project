import mongoose from "mongoose";

/**
 * @description Schema to manage a Tutor's availability, including default weekly
 * schedules and specific date overrides.
 */
const timeSlotSchema = new mongoose.Schema(
  {
    startTime: {
      type: String, // e.g., "09:00"
      required: true,
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "Start time must be in HH:MM format.",
      ],
    },
    endTime: {
      type: String, // e.g., "17:00"
      required: true,
      match: [
        /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
        "End time must be in HH:MM format.",
      ],
    },
  },
  { _id: false }
);

const tutorAvailabilitySchema = new mongoose.Schema(
  {
    // A unique reference to the Tutor user.
    tutor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    // A default weekly schedule that applies every week unless overridden.
    // Example: [{ day: 'Monday', slots: [{ startTime: '09:00', endTime: '12:00' }] }]
    defaultSchedule: [
      {
        day: {
          type: String,
          enum: [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ],
          required: true,
        },
        slots: [timeSlotSchema],
      },
    ],

    // Specific overrides for particular dates. This takes precedence over the default schedule.
    // Example: { date: '2025-12-25', isAvailable: false }
    // Example: { date: '2025-10-31', isAvailable: true, slots: [{...}] }
    customOverrides: [
      {
        date: {
          type: Date, // Stores the specific date, e.g., 2025-10-31
          required: true,
        },
        isAvailable: {
          type: Boolean,
          required: true,
        },
        // If the tutor is available on this specific date, they can provide custom slots.
        // If isAvailable is true and slots are empty, it implies they are free all day.
        slots: [timeSlotSchema],
      },
    ],
  },
  {
    timestamps: true,
  }
);

// To prevent duplicate entries for the same day in the default schedule
tutorAvailabilitySchema.path("defaultSchedule").validate(function (value) {
  const days = value.map((item) => item.day);
  return new Set(days).size === days.length;
}, "Each day can only appear once in the default schedule.");

// To prevent duplicate entries for the same date in custom overrides
tutorAvailabilitySchema.path("customOverrides").validate(function (value) {
  const dates = value.map((item) => item.date.toISOString().split("T")[0]);
  return new Set(dates).size === dates.length;
}, "Each date can only appear once in the custom overrides.");

export const TutorAvailability = mongoose.model(
  "TutorAvailability",
  tutorAvailabilitySchema
);
