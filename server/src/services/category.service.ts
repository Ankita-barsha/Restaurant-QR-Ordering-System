/**
 * Category business logic.
 *
 * Soft deletes throughout: every read filters `deletedAt: null`, because a
 * category removed from the menu must still resolve for the historical orders
 * that reference its foods.
 */

import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import { uniqueSlug } from "../utils/slug.js";
import type {
  CreateCategoryInput,
  ListQuery,
  UpdateCategoryInput,
} from "../validations/category.validation.js";

/** Excludes soft-deleted rows from every query. */
const notDeleted = { deletedAt: null };

const slugExists = async (slug: string, excludeId?: string): Promise<boolean> => {
  const found = await prisma.category.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });

  return found !== null;
};

export const listCategories = async (
  query: ListQuery
): Promise<{ categories: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  const where = {
    ...notDeleted,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.search
      ? // `mode: "insensitive"` is Postgres ILIKE; without it, searching
        // "pizza" would miss a category named "Pizza".
        { name: { contains: query.search, mode: "insensitive" as const } }
      : {}),
  };

  // One transaction so the count and the page come from the same snapshot;
  // otherwise a concurrent insert makes totalPages disagree with the rows.
  const [categories, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        // Menu screens need the item count; computing it here avoids the
        // client issuing one request per category.
        _count: { select: { foods: { where: notDeleted } } },
      },
    }),
    prisma.category.count({ where }),
  ]);

  return { categories, meta: buildPaginationMeta(pagination, total) };
};

export const getCategoryById = async (id: string) => {
  const category = await prisma.category.findFirst({
    where: { id, ...notDeleted },
    include: { _count: { select: { foods: { where: notDeleted } } } },
  });

  if (!category) {
    throw AppError.notFound("Category not found");
  }

  return category;
};

export const getCategoryBySlug = async (slug: string) => {
  const category = await prisma.category.findFirst({
    where: { slug, isActive: true, ...notDeleted },
  });

  if (!category) {
    throw AppError.notFound("Category not found");
  }

  return category;
};

export const createCategory = async (input: CreateCategoryInput) => {
  const existing = await prisma.category.findFirst({
    where: { name: input.name, ...notDeleted },
    select: { id: true },
  });

  if (existing) {
    // 409, not 400: the request is well formed but conflicts with state.
    throw AppError.conflict("A category with this name already exists");
  }

  const slug = await uniqueSlug(input.name, (candidate) => slugExists(candidate));

  return prisma.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
};

export const updateCategory = async (id: string, input: UpdateCategoryInput) => {
  await getCategoryById(id);

  if (input.name) {
    const clash = await prisma.category.findFirst({
      where: { name: input.name, id: { not: id }, ...notDeleted },
      select: { id: true },
    });

    if (clash) {
      throw AppError.conflict("A category with this name already exists");
    }
  }

  // The slug is regenerated only when the name changes, so existing menu URLs
  // are not silently broken by an unrelated edit.
  const slug = input.name
    ? await uniqueSlug(input.name, (candidate) => slugExists(candidate, id))
    : undefined;

  return prisma.category.update({
    where: { id },
    data: { ...input, ...(slug ? { slug } : {}) },
  });
};

/**
 * Soft-deletes a category.
 *
 * Refuses while it still holds foods: silently orphaning menu items would
 * make them unreachable from the menu but still present in the database.
 */
export const deleteCategory = async (id: string): Promise<void> => {
  await getCategoryById(id);

  const foodCount = await prisma.food.count({
    where: { categoryId: id, ...notDeleted },
  });

  if (foodCount > 0) {
    throw AppError.conflict(
      `Cannot delete: ${foodCount} menu item(s) still belong to this category`
    );
  }

  await prisma.category.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
};
