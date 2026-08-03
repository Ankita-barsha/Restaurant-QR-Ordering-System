import http from "node:http";

const payload = JSON.stringify({
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: "pay_test_" + Date.now(),
        order_id: "order_rzp_test_12345",
        amount: 50000,
        currency: "INR",
        status: "captured",
        method: "upi",
      },
    },
  },
});

const req = http.request(
  {
    hostname: "localhost",
    port: 5000,
    path: "/api/payments/razorpay-webhook",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log("Response Status:", res.statusCode);
      console.log("Response Body:", data);
    });
  }
);

req.on("error", (e) => {
  console.error("Error:", e.message);
});

req.write(payload);
req.end();
