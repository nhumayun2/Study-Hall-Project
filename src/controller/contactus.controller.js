import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { sendEmail } from "../utils/sendEmail.js";

/**
 * @description Creates the HTML email template for a contact us submission.
 */
const createContactEmailTemplate = ({ title, email, description }) => {
  return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #333; border-bottom: 2px solid #f4f4f4; padding-bottom: 10px;">New Contact Us Message</h2>
        <p>You have received a new message from the website contact form.</p>
        <hr>
        <p><strong>From:</strong> ${email}</p>
        <p><strong>Title / Subject:</strong> ${title}</p>
        <h3 style="color: #444; margin-top: 20px;">Message:</h3>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; white-space: pre-wrap; font-family: monospace;">
${description}
        </div>
      </div>
    `;
};

/**
 * @description Handles the "Contact Us" form submission.
 * @route POST /api/v1/contact
 * @access Public
 */
export const handleContactForm = catchAsync(async (req, res) => {
  const { title, email, description } = req.body;

  if (!title || !email || !description) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Title, email, and description are all required."
    );
  }

  // --- IMPORTANT ---
  // Define the admin email where you want to receive these messages.
  // Ideally, this should be in your .env file (e.g., ADMIN_EMAIL)
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";

  // Create the email content
  const subject = `New Contact Form Message: ${title}`;
  const html = createContactEmailTemplate({ title, email, description });

  try {
    await sendEmail(adminEmail, subject, html);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message:
        "Your message has been sent successfully. We will contact you soon!",
      data: null,
    });
  } catch (error) {
    console.error("Failed to send contact email:", error);
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Your message failed to send. Please try again later."
    );
  }
});
