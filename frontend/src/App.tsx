import { BrowserRouter, Routes, Route } from "react-router";
import { Root } from "@/routes/root";
import { RunViewer } from "@/routes/run-viewer";
import { Toast } from "@/components/toast";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/runs/:run_id" element={<RunViewer />} />
      </Routes>
      {/* Singleton toast portal — survives route navigation. */}
      <Toast />
    </BrowserRouter>
  );
}
