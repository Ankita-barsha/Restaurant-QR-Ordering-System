import { prisma } from "../config/prisma.js";

async function main() {
  const updated = await prisma.restaurantSettings.upsert({
    where: { id: "singleton" },
    update: {
      highValueThreshold: 3000,
      advancePaymentPercent: 20,
      advancePaymentRequired: true,
      approvalRequired: false,
    },
    create: {
      id: "singleton",
      name: "Bite me Bistro",
      highValueThreshold: 3000,
      advancePaymentPercent: 20,
      advancePaymentRequired: true,
      approvalRequired: false,
    },
  });

  console.log("Successfully updated dynamic advance payment settings in database:");
  console.log("High Value Threshold:", updated.highValueThreshold.toString());
  console.log("Base Advance Percent:", updated.advancePaymentPercent.toString());
  console.log("Advance Required:", updated.advancePaymentRequired);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
