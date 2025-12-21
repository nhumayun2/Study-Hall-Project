import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { User } from "../model/user.model.js";
import { stripe } from "../utils/Stripe.service.js";

/**
 * @description Creates a Stripe Express account and generates an onboarding link for the user.
 */
export const createOnboardingLink = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  const refreshUrl = `${process.env.FRONTEND_URL}/onboarding-refresh`;
  const returnUrl = `${process.env.FRONTEND_URL}/onboarding-return`;

  let accountId = user.stripeAccountId;
  let accountLinkUrl;

  if (accountId) {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    accountLinkUrl = accountLink.url;

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Onboarding link created for existing account.",
      data: { url: accountLinkUrl },
    });
  }

  const account = await stripe.accounts.create({
    type: "express",
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { userId: userId.toString() },
  });
  accountId = account.id;

  user.stripeAccountId = accountId;
  await user.save({ validateBeforeSave: false });

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  accountLinkUrl = accountLink.url;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Stripe account created and onboarding link generated.",
    data: { url: accountLinkUrl },
  });
});

/**
 * @description Verifies the status of a user's onboarding after they return from Stripe.
 */
export const verifyOnboardingStatus = catchAsync(async (req, res) => {
  const userId = req.user._id;

  // CRITICAL FIX: Explicitly select the stripeAccountId which is hidden by default.
  const user = await User.findById(userId).select("+stripeAccountId");

  if (!user || !user.stripeAccountId) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Stripe account not found for this user. Please initiate onboarding."
    );
  }

  const account = await stripe.accounts.retrieve(user.stripeAccountId);

  const onboardingComplete =
    account.details_submitted && account.charges_enabled;

  if (onboardingComplete) {
    // You could add a flag here to mark the user as fully onboarded if needed
    // user.tutorProfile.isVerified = true;
    // await user.save({ validateBeforeSave: false });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Stripe onboarding complete and verified.",
      data: {
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
      },
    });
  } else {
    sendResponse(res, {
      statusCode: httpStatus.ACCEPTED,
      success: false,
      message:
        "Stripe onboarding is not yet complete. Please finish the setup.",
      data: {
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
      },
    });
  }
});
