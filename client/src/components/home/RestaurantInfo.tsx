import {
  Star,
  Clock3,
  MapPin,
  Phone,
  ShieldCheck,
  UtensilsCrossed,
} from "lucide-react";

const RestaurantInfo = () => {
  const cards = [
    {
      icon: <Star className="h-10 w-10 text-yellow-500" />,
      title: "4.9 Rating",
      subtitle: "1200+ Happy Customers",
    },
    {
      icon: <Clock3 className="h-10 w-10 text-red-600" />,
      title: "Open Daily",
      subtitle: "10:00 AM - 11:00 PM",
    },
    {
      icon: <MapPin className="h-10 w-10 text-green-600" />,
      title: "Location",
      subtitle: "Park Street, Kolkata",
    },
    {
      icon: <Phone className="h-10 w-10 text-blue-600" />,
      title: "Call Us",
      subtitle: "+91 98765 43210",
    },
    {
      icon: <UtensilsCrossed className="h-10 w-10 text-orange-500" />,
      title: "Fresh Food",
      subtitle: "Prepared after every order",
    },
    {
      icon: <ShieldCheck className="h-10 w-10 text-emerald-600" />,
      title: "100% Hygiene",
      subtitle: "Certified Kitchen",
    },
  ];

  return (
    <section className="bg-[#FFF8F2] py-20">
      <div className="mx-auto max-w-7xl px-6">

        <div className="mb-14 text-center">
          <h2 className="text-4xl font-bold">
            Why Choose Us?
          </h2>

          <p className="mt-4 text-gray-600">
            Premium food, excellent service and unforgettable dining experience.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl bg-white p-8 shadow-md transition duration-300 hover:-translate-y-2 hover:shadow-xl"
            >
              {card.icon}

              <h3 className="mt-5 text-2xl font-bold">
                {card.title}
              </h3>

              <p className="mt-3 text-gray-600">
                {card.subtitle}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RestaurantInfo;