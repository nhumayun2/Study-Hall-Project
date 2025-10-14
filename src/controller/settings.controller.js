import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Settings } from "../model/settings.model.js";
import { Category } from "../model/category.model.js";
import { SubCategory } from "../model/subCategory.model.js";

// ====================================================================
// --- GLOBAL PLATFORM SETTINGS ---
// ====================================================================

/**
 * @description ADMIN gets the current global platform settings.
 * @route GET /api/v1/admin/settings
 * @access Admin
 */
export const getGlobalSettings = catchAsync(async (req, res) => {
    const settings = await Settings.getSettings();
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Global settings retrieved successfully.",
        data: settings,
    });
});

/**
 * @description ADMIN updates the global platform settings.
 * @route PATCH /api/v1/admin/settings
 * @access Admin
 */
export const updateGlobalSettings = catchAsync(async (req, res) => {
    const updates = req.body;
    
    const updatedSettings = await Settings.findOneAndUpdate(
        { key: "GLOBAL_CONFIG" }, // Find the single settings document
        { $set: updates },
        { new: true, runValidators: true }
    );

    if (!updatedSettings) {
        throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to update settings.");
    }

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Global settings updated successfully.",
        data: updatedSettings,
    });
});


// ====================================================================
// --- CATEGORY & SUB-CATEGORY MANAGEMENT ---
// ====================================================================

/**
 * @description ADMIN creates a new main category.
 * @route POST /api/v1/admin/settings/categories
 * @access Admin
 */
export const createCategory = catchAsync(async (req, res) => {
    const { name, icon } = req.body;
    const newCategory = await Category.create({ name, icon });
    sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: "Category created.", data: newCategory });
});

/**
 * @description ADMIN creates a new sub-category linked to a main category.
 * @route POST /api/v1/admin/settings/sub-categories
 * @access Admin
 */
export const createSubCategory = catchAsync(async (req, res) => {
    const { name, parentCategory } = req.body;
    const newSubCategory = await SubCategory.create({ name, parentCategory });
    sendResponse(res, { statusCode: httpStatus.CREATED, success: true, message: "Sub-category created.", data: newSubCategory });
});

/**
 * @description ADMIN gets all categories and their sub-categories.
 * @route GET /api/v1/admin/settings/categories
 * @access Admin
 */
export const getAllCategoriesAndSubs = catchAsync(async (req, res) => {
    const categories = await Category.find();
    const subCategories = await SubCategory.find();
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Categories fetched.", data: { categories, subCategories } });
});

/**
 * @description ADMIN updates a category.
 * @route PATCH /api/v1/admin/settings/categories/:categoryId
 * @access Admin
 */
export const updateCategory = catchAsync(async (req, res) => {
    const { categoryId } = req.params;
    const updatedCategory = await Category.findByIdAndUpdate(categoryId, req.body, { new: true });
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Category updated.", data: updatedCategory });
});

/**
 * @description ADMIN updates a sub-category.
 * @route PATCH /api/v1/admin/settings/sub-categories/:subCategoryId
 * @access Admin
 */
export const updateSubCategory = catchAsync(async (req, res) => {
    const { subCategoryId } = req.params;
    const updatedSubCategory = await SubCategory.findByIdAndUpdate(subCategoryId, req.body, { new: true });
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Sub-category updated.", data: updatedSubCategory });
});

/**
 * @description ADMIN deletes a category (and its sub-categories).
 * @route DELETE /api/v1/admin/settings/categories/:categoryId
 * @access Admin
 */
export const deleteCategory = catchAsync(async (req, res) => {
    const { categoryId } = req.params;
    await SubCategory.deleteMany({ parentCategory: categoryId });
    await Category.findByIdAndDelete(categoryId);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Category and its sub-categories deleted." });
});

/**
 * @description ADMIN deletes a sub-category.
 * @route DELETE /api/v1/admin/settings/sub-categories/:subCategoryId
 * @access Admin
 */
export const deleteSubCategory = catchAsync(async (req, res) => {
    const { subCategoryId } = req.params;
    await SubCategory.findByIdAndDelete(subCategoryId);
    sendResponse(res, { statusCode: httpStatus.OK, success: true, message: "Sub-category deleted." });
});
