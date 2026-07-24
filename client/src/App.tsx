import { BrowserRouter, Routes, Route } from "react-router-dom";

import MainLayout from "./layouts/MainLayout";

import Home from "./pages/Home";
import Menu from "./pages/Menu";
import Cart from "./pages/Cart";
import OrderStatus from "./pages/OrderStatus";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/order-status" element={<OrderStatus />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;