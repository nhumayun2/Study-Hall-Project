import express from "express";
import { handleContactForm } from "../controller/contactus.controller.js";

const router = express.Router();

/**
 * @route POST /api/v1/contact
 * @description Public endpoint for submitting the "Contact Us" form.
 * @access Public
 */
router.post("/", handleContactForm);

export default router;
