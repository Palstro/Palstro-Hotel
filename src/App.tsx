import {
  PropertyContextProvider,
  usePropertyContext,
} from './hooks/usePropertyContext';

function PropertyDiagnostic() {
  const { property, settings, tenant, loading, error } = usePropertyContext();

  if (loading) return <p>Resolving property…</p>;
  if (error) return <p>Error resolving property: {error.message}</p>;
  if (!property || !settings || !tenant)
    return <p>No property matches this address.</p>;

  return (
    <div>
      <p>Hotel: {property.name}</p>
      <p>Slug: {property.slug}</p>
      <p>Timezone: {property.timezone}</p>
      <p>Currency: {property.currency}</p>
      <p>Template: {settings.template}</p>
    </div>
  );
}

function App() {
  return (
    <PropertyContextProvider>
      <PropertyDiagnostic />
    </PropertyContextProvider>
  );
}

export default App;
