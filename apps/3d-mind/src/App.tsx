import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Upload from './pages/Upload';
import Link from './pages/Link';
import ViewScan from './pages/ViewScan';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/upload" replace />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/link" element={<Link />} />
        <Route path="/view-scan" element={<ViewScan />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
