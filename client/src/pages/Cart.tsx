import { useContext } from "react";
import { CartContext } from "../context/CartContext";

const Cart = () => {
  const { cart, increaseQuantity, decreaseQuantity } =
    useContext(CartContext);

  const subtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  const gst = subtotal * 0.05;
  const grandTotal = subtotal + gst;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-8 text-3xl font-bold">🛒 Your Cart</h1>

      {cart.length === 0 ? (
        <div className="rounded-xl border p-10 text-center">
          <h2 className="text-2xl font-semibold">
            Your cart is empty
          </h2>

          <p className="mt-3 text-gray-500">
            Add some delicious food 🍕
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-5">
            {cart.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border p-5 shadow-sm"
              >
                <div className="flex items-center gap-5">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-24 w-24 rounded-lg object-cover"
                  />

                  <div>
                    <h2 className="text-xl font-bold">
                      {item.name}
                    </h2>

                    <p className="text-gray-500">
                      ₹{item.price}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    onClick={() => decreaseQuantity(item.id)}
                    className="rounded bg-red-600 px-3 py-1 text-white"
                  >
                    -
                  </button>

                  <span className="text-lg font-bold">
                    {item.quantity}
                  </span>

                  <button
                    onClick={() => increaseQuantity(item.id)}
                    className="rounded bg-green-600 px-3 py-1 text-white"
                  >
                    +
                  </button>
                </div>

                <div className="font-bold">
                  ₹{item.price * item.quantity}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-xl border p-6 shadow">
            <div className="mb-2 flex justify-between">
              <span>Subtotal</span>

              <span>₹{subtotal.toFixed(2)}</span>
            </div>

            <div className="mb-2 flex justify-between">
              <span>GST (5%)</span>

              <span>₹{gst.toFixed(2)}</span>
            </div>

            <hr className="my-4" />

            <div className="flex justify-between text-xl font-bold">
              <span>Total</span>

              <span>₹{grandTotal.toFixed(2)}</span>
            </div>

            <button className="mt-6 w-full rounded-lg bg-red-600 py-3 text-lg font-semibold text-white hover:bg-red-700">
              Proceed to Checkout
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Cart;