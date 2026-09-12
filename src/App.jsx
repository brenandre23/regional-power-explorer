import { routerBasename } from './utils/paths';
import { createContext, useContext, useState } from 'react';
import { THEME_LIST } from './constants';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import Navbar from './components/Navbar';
import WorldPage from './pages/WorldPage';
import RegionPage from './pages/RegionPage';
import CountryPage from './pages/CountryPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import { getT } from './constants';

export const ThemeCtx = createContext({ theme: 'fog', setTheme: () => {} });
export const useTheme = () => useContext(ThemeCtx);

export default function App() {
  const [theme, setTheme] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('theme');
    if (p && THEME_LIST.includes(p)) return p;
    return 'paper';
  });
  const t = getT(theme);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <BrowserRouter basename={routerBasename}>
        <div style={{
          display: 'flex', flexDirection: 'column', height: '100vh',
          overflow: 'hidden', backgroundColor: t.bg,
        }}>
          <Navbar />
          <div style={{ flex: 1, overflow: 'hidden', height: 'calc(100vh - 46px)' }}>
            <Routes>
              <Route path="/"                    element={<WorldPage />} />
              <Route path="/region/:regionId"    element={<RegionPage />} />
              <Route path="/country/:iso"        element={<CountryPage />} />
              <Route path="/about"               element={<AboutPage />} />
              <Route path="/contact"             element={<ContactPage />} />
            </Routes>
          </div>
        </div>
        <Analytics />
      </BrowserRouter>
    </ThemeCtx.Provider>
  );
}
