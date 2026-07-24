import { Link } from "react-router-dom";
import { Star } from "lucide-react";

import biriyani from "../../assets/image/biriyani.jpg";
import pizza from "../../assets/image/margherita-pizza.jpg";
import burger from "../../assets/image/burger.jpg";

const dishes = [
  {
    id: 1,
    name: "Chicken biriyani",
    image: biriyani,
    price: 250,
    rating: 4.9,
    tag: "Bestseller",
  },
  {
    id: 2,
    name: "Margherita Pizza",
    image: pizza,
    price: 350,
    rating: 4.8,
    tag: "Popular",
  },
  {
    id: 3,
    name: "Veg Burger",
    image: burger,
    price: 180,
    rating: 4.7,
    tag: "Chef's Choice",
  },
];

const PopularDishes = () => {
  return (
    <section className="bg-[#FFF8F2] py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-12 flex items-center justify-between">
          <div>
            <h2 className="text-4xl font-bold">Popular Dishes</h2>
            <p className="mt-2 text-gray-500">
              Our most loved dishes by customers
            </p>
          </div>

          <Link
            to="/menu"
            className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700"
          >
            View Full Menu
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {dishes.map((dish) => (
            <div
              key={dish.id}
              className="overflow-hidden rounded-2xl bg-white shadow-lg transition hover:-translate-y-2 hover:shadow-2xl"
            >
              <div className="relative">
                <img
                  src={dish.image}
                  alt={dish.name}
                  className="h-64 w-full object-cover"
                />

                <span className="absolute left-4 top-4 rounded-full bg-red-600 px-4 py-1 text-sm font-semibold text-white">
                  {dish.tag}
                </span>
              </div>

              <div className="p-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-2xl font-bold">{dish.name}</h3>

                  <div className="flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-white">
                    <Star size={16} fill="white" />
                    {dish.rating}
                  </div>
                </div>

                <p className="mb-5 text-2xl font-bold text-red-600">
                  ₹{dish.price}
                </p>

                <Link
                  to="/menu"
                  className="block rounded-xl bg-red-600 py-3 text-center font-semibold text-white transition hover:bg-red-700"
                >
                  Order Now
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PopularDishes;