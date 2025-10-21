import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Category } from "../model/category.model.js";
import { Session } from "../model/session.model.js";
import { User } from "../model/user.model.js";
import { Location } from "../model/location.model.js";
import { Withdrawal } from "../model/withdrawal.model.js";
import { TutorAvailability } from "../model/tutorAvailability.model.js";
import { Review } from "../model/review.model.js";
import mongoose from "mongoose";

// ====================================================================
// --- NEW HELPER FUNCTION ---
// ====================================================================

/**
 * @description Calculates a tutor's level based on completed sessions and rating.
 */
const _calculateTutorLevel = (completedSessions, rating) => {
    if (completedSessions >= 100 && rating >= 4.8) return "Pro Tutor";
    if (completedSessions >= 50 && rating >= 4.5) return "Level 4";
    if (completedSessions >= 25 && rating >= 4.2) return "Level 3";
    if (completedSessions >= 10 && rating >= 4.0) return "Level 2";
    return "Level 1";
};


// ====================================================================
// --- ROLE-SPECIFIC HOMEPAGE DATA FETCHERS ---
// ====================================================================

/**
 * @description Fetches all necessary data for the Student homepage.
 */
const getStudentHomepage = async (user) => {
  const categories = await Category.find({ isActive: true }).limit(4).lean();

  const upcomingSessions = await Session.find({
    enrolledStudents: user._id,
    "schedule.date": { $gte: new Date() },
    status: { $in: ["Booked", "Ongoing"] },
  })
    .sort({ "schedule.date": 1 })
    .populate("acceptedTutor", "name")
    .populate("location", "name address")
    .limit(2)
    .lean();

  const popularTutors = await User.find({
    role: "Tutor",
    "tutorProfile.isVerified": true,
  })
    .sort({ "tutorProfile.rating": -1 })
    .limit(3)
    .select("name avatar tutorProfile.rating")
    .lean();

  const newestSessions = await Session.find({
    type: "Offer",
    status: "Active",
  })
    .sort({ createdAt: -1 })
    .populate("acceptedTutor", "name avatar")
    .limit(4)
    .lean();

  return {
    categories,
    upcomingSessions,
    popularTutors,
    newestSessions,
  };
};

/**
 * @description Fetches all necessary data for the Tutor homepage.
 */
const getTutorHomepage = async (user) => {
  const completedSessions = await Session.countDocuments({
    acceptedTutor: user._id,
    status: "Completed",
  });
  const rating = user.tutorProfile?.rating || 0;

  // --- THIS IS THE FIX ---
  // We now calculate the level dynamically.
  const tutorStats = {
    level: _calculateTutorLevel(completedSessions, rating),
    rating: rating,
    totalSessions: completedSessions,
  };
  // --- END FIX ---

  const upcomingSessions = await Session.find({
    acceptedTutor: user._id,
    "schedule.date": { $gte: new Date() },
    status: { $in: ["Booked", "Ongoing"] },
  })
    .sort({ "schedule.date": 1 })
    .populate("creator", "name")
    .populate("location", "name")
    .limit(2)
    .lean();

  const availableSessions = await Session.find({
    type: "Request",
    status: { $in: ["Pending", "AwaitingTutorSelection"] },
    "tutorApplicants.tutorId": { $ne: user._id },
  })
    .sort({ createdAt: -1 })
    .populate("location", "name")
    .limit(4)
    .lean();

  return {
    tutorStats,
    upcomingSessions,
    availableSessions,
  };
};

/**
 * @description Fetches all necessary data for the Location Owner homepage.
 */
const getLocationOwnerHomepage = async (user) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const myLocations = await Location.find({ owner: user._id }).select("_id").lean();
  const myLocationIds = myLocations.map(loc => loc._id);

  const totalSessions = await Session.countDocuments({ location: { $in: myLocationIds }, status: "Completed" });
  const todaySessions = await Session.countDocuments({ location: { $in: myLocationIds }, "schedule.date": { $gte: todayStart, $lte: todayEnd } });
  
  const incomeAggregation = await Session.aggregate([
      { $match: { location: { $in: myLocationIds.map(id => new mongoose.Types.ObjectId(id)) }, status: "Completed" } },
      { $group: { _id: null, total: { $sum: "$locationOwnerEarnings" } } }
  ]);
  const totalIncome = incomeAggregation[0]?.total || 0;
  
  const pendingPayoutAggregation = await Withdrawal.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(user._id), status: "Pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  const pendingPayout = pendingPayoutAggregation[0]?.total || 0;

  const ownerStats = {
    totalSessions,
    todaySessions,
    totalIncome: totalIncome.toFixed(2),
    pendingPayout: pendingPayout.toFixed(2),
  };

  const recentSessions = await Session.find({ location: { $in: myLocationIds } })
    .sort({ createdAt: -1 })
    .populate("location", "name")
    .limit(3)
    .lean();

  return {
    ownerStats,
    recentSessions,
  };
};


// ====================================================================
// --- "MY PANEL" HELPER FUNCTIONS ---
// ====================================================================

/**
 * @description Fetches data for the Tutor's My Panel.
 */
const getTutorPanelDetails = async (user) => {
    const tutorId = user._id;

    const mySessions = await Session.find({ acceptedTutor: tutorId })
        .sort({ "schedule.date": -1 })
        .populate("location", "name")
        .lean();

    const myAvailability = await TutorAvailability.findOne({ tutor: tutorId }).lean();

    const myReviews = await Review.find({ reviewSubjectId: tutorId })
        .sort({ createdAt: -1 })
        .populate("reviewer", "name avatar")
        .lean();

    return {
        mySessions,
        myAvailability: myAvailability || { defaultSchedule: [], customOverrides: [] },
        myReviews,
    };
};

/**
 * @description (NEW) Fetches data for the Location Owner's My Panel.
 */
const getLocationOwnerPanelDetails = async (user) => {
    const myLocations = await Location.find({ owner: user._id }).lean();
    const myLocationIds = myLocations.map(loc => loc._id);

    const myReviews = await Review.find({ 
        reviewSubjectId: { $in: myLocationIds },
        reviewSubjectModel: "Location" 
    })
    .populate('reviewer', 'name avatar')
    .sort({ createdAt: -1 })
    .lean();
    
    return { myLocations, myReviews };
};


// ====================================================================
// --- MAIN CONTROLLERS ---
// ====================================================================

/**
 * @description Main controller that routes to the correct homepage data fetcher based on user role.
 * @route GET /api/v1/home
 * @access Authenticated
 */
export const getHomepageDetails = catchAsync(async (req, res) => {
  const user = req.user;
  let homepageData = {};

  switch (user.role) {
    case "Student":
      homepageData = await getStudentHomepage(user);
      break;
    case "Tutor":
      homepageData = await getTutorHomepage(user);
      break;
    case "LocationOwner":
      homepageData = await getLocationOwnerHomepage(user);
      break;
    default:
      homepageData = { message: "Welcome!" };
  }


  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Homepage data retrieved successfully.",
    data: homepageData,
  });
});

/**
 * @description Fetches all data needed for the "My Panel" screen based on user role.
 * @route GET /api/v1/home/my-panel
 * @access Tutor, LocationOwner
 */
export const getMyPanelDetails = catchAsync(async (req, res) => {
    const user = req.user;
    let panelData = {};

    switch(user.role) {
        case "Tutor":
            panelData = await getTutorPanelDetails(user);
            break;
        case "LocationOwner":
            panelData = await getLocationOwnerPanelDetails(user);
            break;
        default:
            panelData = { message: "My Panel is not available for your role." };
    }
    
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "My Panel data retrieved successfully.",
        data: panelData,
    });
});

