import express from "express";
import {
  getGlobalSettings,
  updateGlobalSettings,
  createCategory,
  createSubCategory,
  getAllCategoriesAndSubs,
  updateCategory,
  updateSubCategory,
  deleteCategory,
  deleteSubCategory,
} from "../controller/settings.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

// All routes in this file are protected and require admin privileges
router.use(protect, isAdmin);

// ====================================================================
// --- GLOBAL SETTINGS ROUTES ---
// ====================================================================

/**
 * @route GET /api/v1/admin/settings
 * @description Get the current global platform settings.
 * @access Admin
 */
router.get("/", getGlobalSettings);

/**
 * @route PATCH /api/v1/admin/settings
 * @description Update the global platform settings.
 * @access Admin
 */
router.patch("/", updateGlobalSettings);

// ====================================================================
// --- CATEGORY & SUB-CATEGORY MANAGEMENT ROUTES ---
// ====================================================================

/**
 * @route GET /api/v1/admin/settings/categories
 * @description Get all categories and sub-categories.
 * @access Admin
 */
router.get("/categories", getAllCategoriesAndSubs);

/**
 * @route POST /api/v1/admin/settings/categories
 * @description Create a new main category.
 * @access Admin
 */
router.post("/categories", createCategory);

/**
 * @route PATCH /api/v1/admin/settings/categories/:categoryId
 * @description Update a main category.
 * @access Admin
 */
router.patch("/categories/:categoryId", updateCategory);

/**
 * @route DELETE /api/v1/admin/settings/categories/:categoryId
 * @description Delete a main category and all its sub-categories.
 * @access Admin
 */
router.delete("/categories/:categoryId", deleteCategory);

/**
 * @route POST /api/v1/admin/settings/sub-categories
 * @description Create a new sub-category.
 * @access Admin
 */
router.post("/sub-categories", createSubCategory);

/**
 * @route PATCH /api/v1/admin/settings/sub-categories/:subCategoryId
 * @description Update a sub-category.
 * @access Admin
 */
router.patch("/sub-categories/:subCategoryId", updateSubCategory);

/**
 * @route DELETE /api/v1/admin/settings/sub-categories/:subCategoryId
 * @description Delete a sub-category.
 * @access Admin
 */
router.delete("/sub-categories/:subCategoryId", deleteSubCategory);

export default router;
