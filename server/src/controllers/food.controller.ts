import type { RequestHandler } from "express";

import * as foodService from "../services/food.service.js";
import { storage } from "../utils/storage.js";
import type {
  CreateFoodInput,
  FoodListQuery,
  UpdateFoodInput,
} from "../validations/food.validation.js";

type IdParams = { id: string };
type SlugParams = { slug: string };
type NoParams = Record<string, never>;

/**
 * Converts an uploaded file into the public URL stored on the record.
 * Returns undefined when no file was sent, so "no image" and "keep the
 * existing image" stay distinguishable in the service layer.
 */
const uploadedImageUrl = (file?: Express.Multer.File): string | undefined =>
  file ? storage.toPublicUrl(file.filename) : undefined;

/** GET /api/foods */
export const list: RequestHandler = async (req, res) => {
  // Set by `validate({ query: ... })` — see category.controller.ts.
  const query = req.validatedQuery as FoodListQuery;

  const { foods, meta } = await foodService.listFoods(query);

  res.json({ success: true, data: foods, meta });
};

/** GET /api/foods/:id */
export const getById: RequestHandler<IdParams> = async (req, res) => {
  const food = await foodService.getFoodById(req.params.id);

  res.json({ success: true, data: food });
};

/** GET /api/foods/slug/:slug */
export const getBySlug: RequestHandler<SlugParams> = async (req, res) => {
  const food = await foodService.getFoodBySlug(req.params.slug);

  res.json({ success: true, data: food });
};

/** POST /api/foods — multipart/form-data, optional `image` field. */
export const create: RequestHandler<NoParams, unknown, CreateFoodInput> = async (
  req,
  res
) => {
  const food = await foodService.createFood(req.body, uploadedImageUrl(req.file));

  res.status(201).json({
    success: true,
    message: "Menu item created",
    data: food,
  });
};

/** PATCH /api/foods/:id */
export const update: RequestHandler<IdParams, unknown, UpdateFoodInput> = async (
  req,
  res
) => {
  const food = await foodService.updateFood(
    req.params.id,
    req.body,
    uploadedImageUrl(req.file)
  );

  res.json({ success: true, message: "Menu item updated", data: food });
};

/** DELETE /api/foods/:id */
export const remove: RequestHandler<IdParams> = async (req, res) => {
  await foodService.deleteFood(req.params.id);

  res.json({ success: true, message: "Menu item deleted" });
};

/** PATCH /api/foods/:id/availability */
export const toggleAvailability: RequestHandler<
  IdParams,
  unknown,
  { isAvailable: boolean }
> = async (req, res) => {
  const food = await foodService.setAvailability(
    req.params.id,
    req.body.isAvailable
  );

  res.json({
    success: true,
    message: req.body.isAvailable ? "Marked as available" : "Marked as sold out",
    data: food,
  });
};
