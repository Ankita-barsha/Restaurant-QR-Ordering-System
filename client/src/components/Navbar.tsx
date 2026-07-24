import { Link } from "react-router-dom";
import { useContext } from "react";
import { CartContext } from "../context/CartContext";

const Navbar = () => {
  const { cart } = useContext(CartContext);

  const totalItems = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  return (
    <nav className="bg-red-600 text-white shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-2xl font-bold">
          🍽️ THE FLORAL CAFE & RESTURANT
        </Link>

        <div className="flex items-center gap-6">
          <Link to="/">Home</Link>

          <Link to="/menu">Menu</Link>

          <Link to="/cart" className="relative">
            🛒 Cart

            {totalItems > 0 && (
              <span className="absolute -right-4 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-black">
                {totalItems}
              </span>
            )}
          </Link>

          <Link to="/order-status">Orders</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;