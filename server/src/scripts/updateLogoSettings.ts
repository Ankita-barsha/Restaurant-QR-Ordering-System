import { prisma } from "../config/prisma.js";

async function main() {
  const updated = await prisma.restaurantSettings.upsert({
    where: { id: "singleton" },
    update: {
      logoUrl: "/uploads/logo.png",
    },
    create: {
      id: "singleton",
      name: "Bite me Bistro",
      logoUrl: "/uploads/logo.png",
    },
  });

  console.log("Successfully updated restaurant logo in Database Settings:");
  console.log("Restaurant Name:", updated.name);
  console.log("Logo URL:", updated.logoUrl);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
