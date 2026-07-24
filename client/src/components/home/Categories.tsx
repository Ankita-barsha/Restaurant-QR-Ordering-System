import { Link } from "react-router-dom";

import pizza from "../../assets/image/margherita-pizza.jpg";
import burger from "../../assets/image/burger.jpg";
import biriyani from "../../assets/image/biriyani.jpg";
import coffee from "../../assets/image/latte.webp";

const categories = [
  {
    name: "Pizza",
    image: pizza,
    category: "Pizza",
  },
  {
    name: "Burger",
    image: burger,
    category: "Burger",
  },
  {
    name: "Main Course",
    image: biriyani,
    category: "Main Course",
  },
  {
    name: "Coffee",
    image: coffee,
    category: "Beverage",
  },
];

const Categories = () => {
  return (
    <section className="bg-white py-20">
      <div className="mx-auto max-w-7xl px-6">

        <div className="mb-12 text-center">
          <h2 className="text-4xl font-bold">
            Explore Categories
          </h2>

          <p className="mt-3 text-gray-500">
            Choose your favourite food
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 lg:grid-cols-5">

          {categories.map((item) => (
            <Link
              key={item.name}
              to={`/menu?category=${item.category}`}
              className="group overflow-hidden rounded-2xl bg-white shadow-lg transition hover:-translate-y-2 hover:shadow-2xl"
            >
              <img
                src={item.image}
                alt={item.name}
                className="h-52 w-full object-cover transition duration-500 group-hover:scale-110"
              />

              <div className="p-5 text-center">

                <h3 className="text-xl font-bold">
                  {item.name}
                </h3>

              </div>
            </Link>
          ))}

        </div>

      </div>
    </section>
  );
};

export default Categories;