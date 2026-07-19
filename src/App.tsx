import { PropertyContextProvider } from './hooks/usePropertyContext';
import { LandingPage } from './pages/LandingPage';

function App() {
  return (
    <PropertyContextProvider>
      <LandingPage />
    </PropertyContextProvider>
  );
}

export default App;
