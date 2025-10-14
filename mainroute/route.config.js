import express from "express";
import authRoute from "../src/route/auth.route.js";
import userRoute from "../src/route/user.route.js";
import courseRouter from "../src/route/course.route.js";
import locationRoute from "../src/route/location.route.js";
import tutorRoute from "../src/route/tutor.route.js";
import tutorCourseRouter from "../src/route/tutor.course.route.js";
import tutorAvailabilityRoute from "../src/route/tutorAvailability.route.js";
import sessionRoute from "../src/route/session.route.js";
import reviewRoute from "../src/route/review.route.js";
import financialRoute from "../src/route/financial.route.js";
import chatRoute from "../src/route/chat.route.js";
import notificationRoute from "../src/route/notification.route.js";
import reportRoute from "../src/route/report.route.js";
import adminRoute from "../src/route/admin.route.js";
import withdrawalRouter from "../src/route/withdrawal.route.js";
import minorRoute from "../src/route/minor.route.js";

const router = express.Router();

// Mounting the routes
router.use("/auth", authRoute);
router.use("/users", userRoute);
router.use("/courses", courseRouter);
router.use("/locations", locationRoute);
router.use("/tutor", tutorRoute);
router.use("/tutor/courses", tutorCourseRouter);
router.use("/tutor/availability", tutorAvailabilityRoute);
router.use("/session", sessionRoute);
router.use("/reviews", reviewRoute);
router.use("/financial", financialRoute);
router.use("/chat", chatRoute);
router.use("/notifications", notificationRoute);
router.use("/reports", reportRoute);
router.use("/admin", adminRoute);
router.use("/minors", minorRoute);
router.use("/withdrawals", withdrawalRouter);

export default router;
