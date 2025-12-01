import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BannerBatchPage } from "./pages/BannerBatchPage";
import "./App.css";

function App() {
  const basename = import.meta.env.MODE === 'production' ? '/bannergen' : '';
  
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Navigate to="/banner-batch" replace />} />
        <Route path="/banner-batch" element={<BannerBatchPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;



