/**
 * Demo data seed — sample menu, tables and orders for local development.
 *
 * Separate from prisma/seed.ts, which creates the rows the application
 * genuinely cannot run without (roles, permissions, admin, settings). This one
 * is throwaway sample content and must never run against production.
 *
 * Idempotent: clears its own demo rows first, so re-running gives a clean set.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/password.js";
import { generateQrImage, generateQrToken } from "../src/utils/qrcode.js";
import { storage } from "../src/utils/storage.js";

/**
 * Demo staff accounts, one per built-in role, so each screen can be seen from
 * the perspective it was designed for. Local development only.
 */
const DEMO_STAFF: { email: string; fullName: string; role: string }[] = [
  { email: "chef@restaurant.local", fullName: "Head Chef", role: "KITCHEN" },
  { email: "waiter@restaurant.local", fullName: "Floor Staff", role: "STAFF" },
  { email: "manager@restaurant.local", fullName: "Restaurant Manager", role: "ADMIN" },
];

const DEMO_PASSWORD = "DemoPassword2026";

const seedStaff = async (): Promise<void> => {
  for (const staff of DEMO_STAFF) {
    const role = await prisma.role.findUnique({ where: { name: staff.role } });

    if (!role) continue;

    // Upsert so re-running does not fail on the unique email, and so a
    // forgotten demo password can be restored by re-seeding.
    await prisma.user.upsert({
      where: { email: staff.email },
      update: { roleId: role.id, isActive: true, deletedAt: null },
      create: {
        email: staff.email,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        fullName: staff.fullName,
        roleId: role.id,
      },
    });
  }

  console.log(`  ${DEMO_STAFF.length} demo staff accounts (password: ${DEMO_PASSWORD})`);
};

/** Sample images shipped in the client repo, copied into the upload folder. */
const CLIENT_IMAGES = path.resolve(process.cwd(), "../client/src/assets/image");

const copyImage = async (source: string, target: string): Promise<string | undefined> => {
  try {
    await fs.copyFile(path.join(CLIENT_IMAGES, source), path.join(storage.root, target));
    return storage.toPublicUrl(target);
  } catch {
    // Missing sample art is not a failure; the item simply has no image.
    return undefined;
  }
};

const CATEGORIES = [
  { name: "Pizza", sortOrder: 1 },
  { name: "Burgers", sortOrder: 2 },
  { name: "Indian", sortOrder: 3 },
  { name: "Desserts", sortOrder: 4 },
  { name: "Beverages", sortOrder: 5 },
];

const FOODS: {
  name: string;
  category: string;
  price: string;
  veg: boolean;
  prep: number;
  image?: string;
  description: string;
  /** Chef's recommendation — appears on the welcome page. */
  featured?: boolean;
}[] = [
  { name: "Margherita Pizza", category: "Pizza", price: "349.00", veg: true, prep: 18, image: "margherita-pizza.jpg", description: "San Marzano tomato, fior di latte, fresh basil" },
  { name: "Pepperoni Pizza", category: "Pizza", price: "449.00", veg: false, prep: 18, image: "pepperoni-pizza.jpg", description: "Double pepperoni, mozzarella, oregano" },
  { name: "Classic Cheeseburger", category: "Burgers", price: "279.00", veg: false, prep: 12, image: "burger.jpg", description: "Aged cheddar, house pickles, brioche bun" },
  { name: "Paneer Tikka Burger", category: "Burgers", price: "249.00", veg: true, prep: 12, image: "Paneer-Burger.webp", description: "Chargrilled paneer, mint mayo, red onion" },
  { name: "Chicken Biryani", category: "Indian", price: "389.00", veg: false, prep: 25, image: "biriyani.jpg", description: "Slow-cooked basmati, saffron, fried onion", featured: true },
  { name: "Paneer Butter Masala", category: "Indian", price: "329.00", veg: true, prep: 20, image: "paneer-butter-masala.jpg", description: "Creamy tomato gravy, kasuri methi", featured: true },
  { name: "Garlic Naan", category: "Indian", price: "79.00", veg: true, prep: 8, image: "garlic naan.jpg", description: "Tandoor-baked, brushed with garlic butter" },
  { name: "Chocolate Lava Cake", category: "Desserts", price: "199.00", veg: true, prep: 15, image: "dessert.jpg", description: "Molten centre, vanilla bean ice cream", featured: true },
  { name: "Caffe Latte", category: "Beverages", price: "159.00", veg: true, prep: 5, image: "latte.webp", description: "Double shot, steamed milk, light foam" },
  { name: "Fresh Lime Soda", category: "Beverages", price: "99.00", veg: true, prep: 3, image: "limesoda.jpg", description: "Sweet, salted or mixed" },
];

/**
 * Sample welcome-page copy, so a fresh install shows the CMS working rather
 * than an empty admin form and a page that looks unchanged.
 */
const DEMO_CONTENT = {
  heroEyebrow: "Est. 2019 · Fine Dining",
  heroLede:
    "A seasonal menu built around fire, patience and produce picked the same morning. Scan the code on your table, order at your pace, and let the kitchen do the rest.",
  bannerText: "Chef's tasting menu — Thursday to Sunday, from seven.",
  featuredEyebrow: "Chef's recommendation",
  featuredTitle: "What we would order",
  featuredLede:
    "The plates the kitchen is proudest of tonight. Prices are live from the menu you will order from.",
  aboutEyebrow: "The house",
  aboutTitle: "A room built around one table",
  aboutBody:
    "The kitchen is open to the room because there is nothing in it we would rather you did not see. Everything is cooked to order, which is the honest reason some plates take longer than others.\n\nThe menu changes when the produce changes — not on a schedule. Scan the code at your table and it will always show you what we can actually cook tonight.",
  footerNote: "Scan, order, dine.",
};

/** Sample testimonials for the reviews section. */
const DEMO_REVIEWS = [
  {
    customerName: "Ananya Sen",
    rating: 5,
    comment:
      "The tasting menu moved at exactly the right pace. Every course arrived the moment the last was forgotten.",
    sortOrder: 1,
  },
  {
    customerName: "Rohan Mehta",
    rating: 5,
    comment:
      "I have eaten in rooms with three stars that were less considered than this. The service never once interrupted the table.",
    sortOrder: 2,
  },
  {
    customerName: "Priya Raghavan",
    rating: 4,
    comment:
      "We scanned the code and ordered without ever flagging anyone down. It felt effortless rather than automated.",
    sortOrder: 3,
  },
];

const main = async (): Promise<void> => {
  console.log("\nSeeding demo data...\n");

  await storage.init();

  // Clear previous demo content. Order matters: children before parents.
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.food.deleteMany();
  await prisma.category.deleteMany();
  await prisma.table.deleteMany();

  const categoryIds = new Map<string, string>();

  for (const category of CATEGORIES) {
    const created = await prisma.category.create({
      data: {
        name: category.name,
        slug: category.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        sortOrder: category.sortOrder,
      },
    });

    categoryIds.set(category.name, created.id);
  }

  console.log(`  ${CATEGORIES.length} categories`);

  for (const [index, food] of FOODS.entries()) {
    const imageUrl = food.image
      ? await copyImage(food.image, `demo-${index}-${food.image}`)
      : undefined;

    await prisma.food.create({
      data: {
        name: food.name,
        slug: food.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: food.description,
        price: food.price,
        imageUrl,
        isVegetarian: food.veg,
        isFeatured: food.featured ?? false,
        preparationMinutes: food.prep,
        categoryId: categoryIds.get(food.category)!,
      },
    });
  }

  console.log(
    `  ${FOODS.length} menu items (${FOODS.filter((food) => food.featured).length} featured)`
  );

  // The content singleton is upserted rather than deleted and recreated: it is
  // one row the application always expects to find.
  await prisma.siteContent.upsert({
    where: { id: "singleton" },
    update: DEMO_CONTENT,
    create: { id: "singleton", ...DEMO_CONTENT },
  });

  await prisma.review.deleteMany();
  await prisma.review.createMany({ data: DEMO_REVIEWS });

  console.log(`  welcome-page content and ${DEMO_REVIEWS.length} reviews`);

  const tables: { number: string; token: string }[] = [];

  for (let i = 1; i <= 8; i += 1) {
    const tableNumber = `T-${String(i).padStart(2, "0")}`;
    const qrToken = generateQrToken();
    const qrImageUrl = await generateQrImage(qrToken);

    await prisma.table.create({
      data: {
        tableNumber,
        capacity: i <= 4 ? 2 : 6,
        qrToken,
        qrImageUrl,
      },
    });

    tables.push({ number: tableNumber, token: qrToken });
  }

  console.log(`  ${tables.length} tables, each with a QR code`);

  await seedStaff();

  console.log("\nScan URLs for testing:");
  for (const table of tables.slice(0, 3)) {
    console.log(`  ${table.number}  ->  /api/tables/scan/${table.token}`);
  }

  console.log("\nDemo data ready.\n");
};

try {
  await main();
} catch (error) {
  console.error("\nDemo seed failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
