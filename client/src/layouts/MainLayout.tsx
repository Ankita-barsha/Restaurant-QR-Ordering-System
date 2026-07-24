import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";

const MainLayout = () => {
  return (
    <div>
      <Navbar />

      {/* No max-width or padding here: the landing page is full-bleed and each
          page owns its own container. */}
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;