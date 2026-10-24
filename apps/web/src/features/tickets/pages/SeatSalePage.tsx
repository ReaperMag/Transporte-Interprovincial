import { useParams } from 'react-router-dom';

export function SeatSalePage() {
  const { tripId } = useParams<{ tripId: string }>();

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Venta de asientos</h1>
      <p>Viaje: {tripId}</p>
      <p>Esta vista aún no está implementada.</p>
    </div>
  );
}
