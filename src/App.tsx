import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { BannerBatchPage } from "./pages/BannerBatchPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/banner-batch" replace />} />
        <Route path="/banner-batch" element={<BannerBatchPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;



