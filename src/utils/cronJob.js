import cron from "node-cron";
import { Mood } from "../model/mood.model.js";
import { User } from "../model/user.model.js"; // jodi sob user ke iterate korte hoy

// Run every day at 11:59 PM
cron.schedule("59 23 * * *", async () => {
  console.log("Running daily mood submission check...");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const users = await User.find({}, "_id");

    for (const user of users) {
      const moodLog = await Mood.findOne({ userId: user._id, date: today });

      if (!moodLog) {
        await Mood.create({
          userId: user._id,
          date: today,
          mood: null,
          satisfaction: null,
          status: false,
        });
      } else {
        moodLog.status = !!(moodLog.mood && moodLog.satisfaction);
        await moodLog.save();
      }
    }
  } catch (err) {
    console.error("Error running mood check cron:", err);
  }
});
