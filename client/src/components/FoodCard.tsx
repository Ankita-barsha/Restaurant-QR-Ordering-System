import { useContext } from "react";
import { CartContext } from "../context/CartContext";
import type { Food } from "../types/food";

interface FoodCardProps {
  food: Food;
}

const FoodCard = ({ food }: FoodCardProps) => {
  const {
    cart,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
  } = useContext(CartContext);

  const cartItem = cart.find((item) => item.id === food.id);

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-md transition hover:shadow-xl">
      <img
        src={food.image}
        alt={food.name}
        className="h-52 w-full object-cover"
      />

      <div className="p-4">
        <h2 className="text-xl font-bold">{food.name}</h2>

        <p className="mt-2 text-sm text-gray-600">
          {food.description}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-semibold text-red-600">
            ₹{food.price}
          </span>

          <span className="text-sm text-gray-500">
            ⏱ {food.preparationTime} mins
          </span>
        </div>

        <div className="mt-2">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm">
            {food.category}
          </span>
        </div>

        {!cartItem ? (
          <button
            onClick={() => addToCart(food)}
            className="mt-4 w-full rounded-lg bg-red-600 py-2 font-semibold text-white hover:bg-red-700"
          >
            Add to Cart
          </button>
        ) : (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-red-600 p-2 text-white">
            <button
              onClick={() => decreaseQuantity(food.id)}
              className="px-3 text-xl"
            >
              −
            </button>

            <span className="font-bold">
              {cartItem.quantity}
            </span>

            <button
              onClick={() => increaseQuantity(food.id)}
              className="px-3 text-xl"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FoodCard;