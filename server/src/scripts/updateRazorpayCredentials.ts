import { prisma } from "../config/prisma.js";

async function main() {
  const updated = await prisma.restaurantSettings.upsert({
    where: { id: "singleton" },
    update: {
      paymentGatewayProvider: "RAZORPAY",
      razorpayKeyId: "rzp_test_S61c2cS0djwGfw",
      razorpayKeySecret: "Gp7z5chXHdx5q3n5o2urV1Ly",
    },
    create: {
      id: "singleton",
      name: "Bite me Bistro",
      paymentGatewayProvider: "RAZORPAY",
      razorpayKeyId: "rzp_test_S61c2cS0djwGfw",
      razorpayKeySecret: "Gp7z5chXHdx5q3n5o2urV1Ly",
    },
  });

  console.log("Successfully updated Razorpay credentials in Database Settings:");
  console.log("Razorpay Key ID:", updated.razorpayKeyId);
  console.log("Razorpay Key Secret:", updated.razorpayKeySecret);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
