import type { RequestHandler } from "express";

import * as categoryService from "../services/category.service.js";
import type {
  CreateCategoryInput,
  ListQuery,
  UpdateCategoryInput,
} from "../validations/category.validation.js";

/**
 * Handlers declare their params/body/query types through RequestHandler's
 * generics rather than casting `req.body as T`.
 *
 * Express types route params as `string | string[]` because wildcard routes
 * can repeat a key, and `req.query` as ParsedQs. Naming the concrete shape
 * here documents the contract the `validate` middleware has already enforced,
 * and keeps `req.params.id` typed as a plain string.
 */
type IdParams = { id: string };
type SlugParams = { slug: string };
type NoParams = Record<string, never>;

/** GET /api/categories */
export const list: RequestHandler = async (req, res) => {
  // Set by `validate({ query: ... })`. NOT req.query, which Express 5 re-parses
  // from the URL on every access and so never carries validated values.
  const query = req.validatedQuery as ListQuery;

  const { categories, meta } = await categoryService.listCategories(query);

  res.json({ success: true, data: categories, meta });
};

/** GET /api/categories/:id */
export const getById: RequestHandler<IdParams> = async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);

  res.json({ success: true, data: category });
};

/** GET /api/categories/slug/:slug */
export const getBySlug: RequestHandler<SlugParams> = async (req, res) => {
  const category = await categoryService.getCategoryBySlug(req.params.slug);

  res.json({ success: true, data: category });
};

/** POST /api/categories */
export const create: RequestHandler<NoParams, unknown, CreateCategoryInput> = async (
  req,
  res
) => {
  const category = await categoryService.createCategory(req.body);

  // 201 Created, with the new resource in the body.
  res.status(201).json({
    success: true,
    message: "Category created",
    data: category,
  });
};

/** PATCH /api/categories/:id */
export const update: RequestHandler<IdParams, unknown, UpdateCategoryInput> = async (
  req,
  res
) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);

  res.json({ success: true, message: "Category updated", data: category });
};

/** DELETE /api/categories/:id */
export const remove: RequestHandler<IdParams> = async (req, res) => {
  await categoryService.deleteCategory(req.params.id);

  res.json({ success: true, message: "Category deleted" });
};
