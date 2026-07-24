import { Link } from "react-router-dom";
import hero from "../../assets/image/hero.jpg";
import { Star, Clock3, MapPin } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative h-screen overflow-hidden">
      {/* Background Image */}
      <img
        src={hero}
        alt="Restaurant"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/60"></div>

      {/* Content */}
      <div className="relative z-10 flex h-full items-center justify-center px-6">
        <div className="max-w-3xl text-center text-white">
          <p className="mb-4 text-lg uppercase tracking-[6px] text-yellow-400">
            Welcome to
          </p>

          <h1 className="text-6xl font-extrabold leading-tight">
            THE FLORAL CAFE & RESTURANT
          </h1>
          <h6 className="mt-4 text-2xl font-semibold">
            Order your favourite food with just a few clicks
            <p className="mt-2 text-xl text-gray-200">
              TASTE IT AND FEEL THE FLAVOUR OF FOOD
            </p>
          </h6>



          <div className="mt-8 flex justify-center gap-8 text-lg">
            <div className="flex items-center gap-2">
              <Star className="text-yellow-400" />
              <span>4.9 Rating</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock3 />
              <span>10 AM - 11 PM</span>
            </div>

            <div className="flex items-center gap-2">
              <MapPin />
              <span>Park Street</span>
            </div>
          </div>

          <div className="mt-10 flex justify-center gap-5">
            <Link
              to="/menu"
              className="rounded-xl bg-red-600 px-8 py-4 text-lg font-semibold transition hover:scale-105 hover:bg-red-700"
            >
              Explore Menu
            </Link>

            <Link
              to="/cart"
              className="rounded-xl border-2 border-white px-8 py-4 text-lg font-semibold transition hover:bg-white hover:text-black"
            >
              My Cart
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;