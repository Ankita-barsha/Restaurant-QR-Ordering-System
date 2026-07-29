/**
 * Food (menu item) business logic.
 */

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import { assertOfferIsCoherent, deriveOfferPrice } from "../utils/offer.js";
import { uniqueSlug } from "../utils/slug.js";
import { emitFoodAvailabilityChanged } from "../socket/index.js";
import { storage } from "../utils/storage.js";
import type {
  CreateFoodInput,
  FoodListQuery,
  UpdateFoodInput,
} from "../validations/food.validation.js";

const notDeleted = { deletedAt: null };

/** Category summary included with every food, so the client needs one call. */
const foodInclude = {
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.FoodInclude;

const slugExists = async (slug: string, excludeId?: string): Promise<boolean> => {
  const found = await prisma.food.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });

  return found !== null;
};

/** Confirms the target category exists before pointing a food at it. */
const assertCategoryExists = async (categoryId: string): Promise<void> => {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, ...notDeleted },
    select: { id: true },
  });

  if (!category) {
    throw AppError.badRequest("The selected category does not exist");
  }
};

export const listFoods = async (
  query: FoodListQuery
): Promise<{ foods: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  const where: Prisma.FoodWhereInput = {
    ...notDeleted,
    ...(query.includeUnavailable ? {} : { isAvailable: true }),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.category ? { category: { slug: query.category } } : {}),
    // Compared against undefined, not used as a truthy test: `isVegetarian=false`
    // is a real filter, and a truthy check would silently ignore it.
    ...(query.isVegetarian !== undefined
      ? { isVegetarian: query.isVegetarian }
      : {}),
    ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
    ...(query.isOfferActive !== undefined
      ? { isOfferActive: query.isOfferActive }
      : {}),
    ...(query.search
      ? {
          // Searches name and description together, so "spicy" matches an item
          // whose name does not contain it but whose description does.
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder ?? "desc";

  const [foods, total] = await prisma.$transaction([
    prisma.food.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { [sortBy]: sortOrder },
      include: foodInclude,
    }),
    prisma.food.count({ where }),
  ]);

  return { foods, meta: buildPaginationMeta(pagination, total) };
};

export const getFoodById = async (id: string) => {
  const food = await prisma.food.findFirst({
    where: { id, ...notDeleted },
    include: foodInclude,
  });

  if (!food) {
    throw AppError.notFound("Menu item not found");
  }

  return food;
};

export const getFoodBySlug = async (slug: string) => {
  const food = await prisma.food.findFirst({
    where: { slug, isAvailable: true, ...notDeleted },
    include: foodInclude,
  });

  if (!food) {
    throw AppError.notFound("Menu item not found");
  }

  return food;
};

/**
 * Resolves the offer columns to write.
 *
 * `offerPrice` is DERIVED here and nowhere else. It is never read from the
 * request — a client that could post its own offer price could sell itself a
 * dish for a rupee, which is the same reasoning that keeps prices off the
 * order endpoint.
 *
 * Switching an offer off nulls the derived price but KEEPS the type and value,
 * so a seasonal promotion can be switched back on next month without being
 * re-entered. `isOfferActive` alone decides what a diner pays.
 */
const offerColumns = (
  price: string | { toString(): string },
  offer: {
    isOfferActive?: boolean;
    offerType?: "PERCENTAGE" | "FIXED";
    offerValue?: string;
    offerLabel?: string;
  }
) => {
  // Throws a 400 naming the mistake, e.g. a ₹600 discount on a ₹500 dish.
  assertOfferIsCoherent(price, offer);

  return {
    isOfferActive: offer.isOfferActive ?? false,
    offerType: offer.offerType ?? null,
    offerValue: offer.offerValue ?? null,
    // Normalised to null so "no custom label" has one representation. An empty
    // string would display identically but read differently.
    offerLabel: offer.offerLabel?.trim() ? offer.offerLabel.trim() : null,
    offerPrice: deriveOfferPrice(price, offer),
  };
};

export const createFood = async (
  input: CreateFoodInput,
  imageUrl?: string
) => {
  await assertCategoryExists(input.categoryId);

  const slug = await uniqueSlug(input.name, (candidate) => slugExists(candidate));

  return prisma.food.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      // Passed as a string; Prisma converts it to an exact Decimal.
      price: input.price,
      imageUrl,
      categoryId: input.categoryId,
      isAvailable: input.isAvailable ?? true,
      isVegetarian: input.isVegetarian ?? false,
      isFeatured: input.isFeatured ?? false,
      preparationMinutes: input.preparationMinutes,
      ...offerColumns(input.price, input),
    },
    include: foodInclude,
  });
};

export const updateFood = async (
  id: string,
  input: UpdateFoodInput,
  imageUrl?: string
) => {
  const existing = await getFoodById(id);

  if (input.categoryId) {
    await assertCategoryExists(input.categoryId);
  }

  const slug = input.name
    ? await uniqueSlug(input.name, (candidate) => slugExists(candidate, id))
    : undefined;

  /**
   * The offer is re-derived from the MERGED row, not from the patch.
   *
   * A PATCH may carry any subset, and the offer price depends on all of it.
   * Deriving from the request alone would mean that dropping a dish's price
   * from ₹500 to ₹300 while a 20% offer ran left `offerPrice` at ₹400 — a
   * dish advertised, and charged, ABOVE its own list price.
   */
  const nextPrice = input.price ?? existing.price.toString();

  const offer = offerColumns(nextPrice, {
    isOfferActive: input.isOfferActive ?? existing.isOfferActive,
    offerType: input.offerType ?? existing.offerType ?? undefined,
    offerValue: input.offerValue ?? existing.offerValue?.toString(),
    offerLabel: input.offerLabel ?? existing.offerLabel ?? undefined,
  });

  const updated = await prisma.food.update({
    where: { id },
    data: {
      ...input,
      ...(slug ? { slug } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...offer,
    },
    include: foodInclude,
  });

  // Delete the old image only after the row is safely updated. Doing it first
  // would lose the file if the update then failed.
  if (imageUrl && existing.imageUrl) {
    await storage.remove(existing.imageUrl);
  }

  return updated;
};

/**
 * Soft-deletes a menu item.
 *
 * The image is deliberately NOT removed: past orders still display it, and a
 * soft delete is reversible. Purging files belongs in a retention job that
 * runs against genuinely unreferenced records.
 */
export const deleteFood = async (id: string): Promise<void> => {
  await getFoodById(id);

  await prisma.food.update({
    where: { id },
    data: { deletedAt: new Date(), isAvailable: false },
  });
};

/** Toggles availability — the "sold out" switch used constantly during service. */
export const setAvailability = async (id: string, isAvailable: boolean) => {
  await getFoodById(id);

  const updated = await prisma.food.update({
    where: { id },
    data: { isAvailable },
    include: foodInclude,
  });

  // Broadcast so a diner mid-browse sees the item grey out before ordering it.
  emitFoodAvailabilityChanged({
    id: updated.id,
    name: updated.name,
    isAvailable: updated.isAvailable,
  });

  return updated;
};

/**
 * Marks a dish as the chef's recommendation, or takes the badge off.
 *
 * Any number of dishes may be featured at once: the welcome page renders them
 * as a set, and forcing a single choice would mean unfeaturing one dish as a
 * side effect of featuring another — a surprise the admin never asked for.
 */
export const setFeatured = async (id: string, isFeatured: boolean) => {
  await getFoodById(id);

  return prisma.food.update({
    where: { id },
    data: { isFeatured },
    include: foodInclude,
  });
};
