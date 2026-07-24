import Hero from "../components/home/Hero";
import RestaurantInfo from "../components/home/RestaurantInfo";
import Categories from "../components/home/Categories";
import PopularDishes from "../components/home/PopularDishes";

const Home = () => {
  return (
    <>
      <Hero />
      <RestaurantInfo />
      <Categories />
      <PopularDishes />
    </>
  );
};

export default Home;