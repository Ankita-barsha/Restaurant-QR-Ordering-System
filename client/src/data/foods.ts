import type { Food } from "../types/food";
import biriyani from "../assets/image/biriyani.jpg";
import pizza from "../assets/image/margherita-pizza.jpg";
import burger from "../assets/image/burger.jpg";
import latte from "../assets/image/latte.webp";

export const foods: Food[] = [
  {
    id: 1,
    name: "Chicken biriyani",
    description: "Authentic Hyderabadi Chicken biriyani",
    category: "Main Course",
    price: 250,
    preparationTime: 20,
    available: true,
    image: biriyani,
  },
  {
    id: 2,
    name: "Margherita Pizza",
    description: "Classic cheese pizza",
    category: "Pizza",
    price: 350,
    preparationTime: 15,
    available: true,
    image: pizza,
  },
  {
    id: 3,
    name: "Veg Burger",
    description: "Fresh veggie burger",
    category: "Burger",
    price: 180,
    preparationTime: 10,
    available: true,
    image: burger,
  },
  {
    id: 4,
    name: "Coffee Latte",
    description: "Freshly brewed latte",
    category: "Beverage",
    price: 150,
    preparationTime: 10,
    available: true,
    image: latte,
  },
];