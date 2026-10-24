import { Link } from 'react-router-dom';
import './OficinistaDashboardPage.css';

export function OficinistaDashboardPage() {
  // Datos simulados (listos para reemplazar con datos reales desde API)
  const oficinista = {
    fullName: 'Juan Carlos Pérez',
  };

  const upcomingTrips = [
    {
      tripId: 1,
      departureTime: '08:30',
      routeOrigin: 'Quito',
      routeDestination: 'Ambato',
      busPlate: 'ABC-1234',
    },
    {
      tripId: 2,
      departureTime: '10:15',
      routeOrigin: 'Quito',
      routeDestination: 'Latacunga',
      busPlate: 'DEF-5678',
    },
    {
      tripId: 3,
      departureTime: '12:00',
      routeOrigin: 'Quito',
      routeDestination: 'Riobamba',
      busPlate: 'GHI-9012',
    },
  ];

  return (
    <div className="oficinista-dashboard">
      <header className="oficinista-dashboard__header">
        <h1 className="oficinista-dashboard__title">Panel de Oficinista</h1>
        <p className="oficinista-dashboard__oficinista-name">Oficinista: {oficinista.fullName}</p>
      </header>

      <section className="oficinista-dashboard__section">
        <h2 className="oficinista-dashboard__section-title">Rutas próximas por salir</h2>
        {upcomingTrips.length === 0 ? (
          <p className="oficinista-dashboard__empty">No hay rutas próximas por salir.</p>
        ) : (
          <div className="oficinista-dashboard__table-wrapper">
            <table className="oficinista-dashboard__table">
              <thead>
                <tr>
                  <th>Hora de salida</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Placa</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {upcomingTrips.map((trip) => (
                  <tr key={trip.tripId}>
                    <td>{trip.departureTime}</td>
                    <td>{trip.routeOrigin}</td>
                    <td>{trip.routeDestination}</td>
                    <td>{trip.busPlate}</td>
                    <td>
                      <Link
                        to={`/oficinista/vender-asientos/${trip.tripId}`}
                        className="oficinista-dashboard__sell-button"
                      >
                        Ingresar a comprar asiento
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
