import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import FoodCard from "../components/FoodCard";
import { foods } from "../data/foods";

const Menu = () => {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [searchParams] = useSearchParams();
  const tableNumber = searchParams.get("table");

  const filteredFoods = foods.filter((food) => {
    const matchesSearch = food.name
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesCategory =
      selectedCategory === "All" ||
      food.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="mb-2 text-3xl font-bold">🍽️ Our Menu</h1>

      <p className="mb-6 text-lg font-semibold text-red-600">
        Table No: {tableNumber || "Not Selected"}
      </p>

      {/* Search Box */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search your favorite food..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      {/* Category Buttons */}
      <div className="mb-6 flex flex-wrap gap-3">
        {["All", "Main Course", "Pizza", "Burger", "Beverage"].map(
          (category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`rounded-lg px-4 py-2 transition ${
                selectedCategory === category
                  ? "bg-red-600 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {category}
            </button>
          )
        )}
      </div>

      {/* Food Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredFoods.length > 0 ? (
          filteredFoods.map((food) => (
            <FoodCard key={food.id} food={food} />
          ))
        ) : (
          <div className="col-span-full text-center text-gray-500">
            No food found.
          </div>
        )}
      </div>
    </div>
  );
};

export default Menu;