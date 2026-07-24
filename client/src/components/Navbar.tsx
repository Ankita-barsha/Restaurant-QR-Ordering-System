import { Link, NavLink } from "react-router-dom";

import { useCart } from "../context/CartContext";

const Navbar = () => {
  // Now reads the API-backed cart, which also knows which table was scanned.
  const { itemCount, table } = useCart();

  return (
    <nav className="bg-red-600 text-white shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/menu" className="text-lg font-bold sm:text-2xl">
          🍽️ THE FLORAL CAFE
        </Link>

        <div className="flex items-center gap-5 text-sm sm:text-base">
          {/* Shown only once a QR code has been scanned, so a diner can always
              confirm which table their order will be sent to. */}
          {table && (
            <span className="hidden rounded-full bg-white/20 px-3 py-1 text-xs font-semibold sm:inline">
              Table {table.tableNumber}
            </span>
          )}

          <NavLink to="/menu" className="hover:underline">
            Menu
          </NavLink>

          <Link to="/cart" className="relative hover:underline">
            🛒 Cart
            {itemCount > 0 && (
              <span className="absolute -right-4 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-black">
                {itemCount}
              </span>
            )}
          </Link>

          <NavLink to="/track" className="hover:underline">
            Track
          </NavLink>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
