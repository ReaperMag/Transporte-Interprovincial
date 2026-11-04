import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getPassengerTickets,
  getPassengerReservationTickets,
  getPassengerTicketQrUrl,
  getPassengerGoogleWalletUrl,
  getPassengerAppleWalletPass,
  type TicketRead,
  type TicketValidity,
} from '../services/ticket.service';
import './PassengerTripSearchPage.css';

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guayaquil',
  });
}

function getValidityLabel(validity: TicketValidity): string {
  switch (validity) {
    case 'valid':
      return 'Válido para abordar';
    case 'used':
      return 'Utilizado';
    case 'cancelled':
      return 'Cancelado';
    case 'expired':
      return 'Vencido';
    default:
      return validity;
  }
}

function getCategoryLabel(category: string): string {
  switch (category) {
    case 'regular':
      return 'Regular';
    case 'minor':
      return 'Menor de edad';
    case 'senior':
      return 'Tercera edad';
    case 'disability':
      return 'Discapacidad';
    default:
      return category;
  }
}

export function PassengerTicketsPage() {
  const [searchParams] = useSearchParams();

  const reservationParam = searchParams.get('reserva');

  const parsedReservationId = reservationParam === null ? null : Number(reservationParam);

  const reservationId =
    parsedReservationId !== null &&
    Number.isSafeInteger(parsedReservationId) &&
    parsedReservationId > 0
      ? parsedReservationId
      : null;

  const invalidReservationId = reservationParam !== null && reservationId === null;

  const [tickets, setTickets] = useState<TicketRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Mostrar únicamente el código QR solicitado por el pasajero.
  const [visibleQrId, setVisibleQrId] = useState<number | null>(null);
  const [qrErrorId, setQrErrorId] = useState<number | null>(null);

  // Controlar la generación de pases de Google Wallet y Apple Wallet.
  const [walletAction, setWalletAction] = useState<{
    ticketId: number;
    provider: 'google' | 'apple';
  } | null>(null);

  // Mostrar errores de Wallet únicamente en el boleto correspondiente.
  const [walletError, setWalletError] = useState<{
    ticketId: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    async function loadTickets() {
      setLoading(true);
      setError(null);
      setTickets([]);
      setVisibleQrId(null);
      setQrErrorId(null);
      setWalletError(null);

      if (invalidReservationId) {
        setError('El identificador de la reserva no es válido.');
        setLoading(false);
        return;
      }

      try {
        const result =
          reservationId === null
            ? await getPassengerTickets()
            : await getPassengerReservationTickets(reservationId);

        if (active) {
          setTickets(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Ocurrió un error al consultar tus boletos.',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTickets();

    return () => {
      active = false;
    };
  }, [reservationId, invalidReservationId, refreshKey]);

  // Actualizar la lista de boletos.
  function handleRefresh() {
    if (loading || walletAction !== null) return;

    setRefreshKey((current) => current + 1);
  }

  // Mostrar u ocultar el código QR.
  function handleToggleQr(ticketId: number) {
    setQrErrorId(null);

    setVisibleQrId((current) => (current === ticketId ? null : ticketId));
  }

  // Obtener y abrir el enlace de Google Wallet.
  async function handleGoogleWallet(ticketId: number) {
    if (walletAction !== null) return;

    setWalletError(null);
    setWalletAction({ ticketId, provider: 'google' });

    try {
      const url = await getPassengerGoogleWalletUrl(ticketId);

      // Abrir Google Wallet en la misma pestaña.
      window.location.assign(url);
    } catch (err) {
      setWalletError({
        ticketId,
        message:
          err instanceof Error
            ? err.message
            : 'No se pudo abrir Google Wallet. Inténtalo nuevamente.',
      });
    } finally {
      setWalletAction(null);
    }
  }

  // Obtener y descargar el archivo firmado de Apple Wallet.
  async function handleAppleWallet(ticketId: number) {
    if (walletAction !== null) return;

    setWalletError(null);
    setWalletAction({ ticketId, provider: 'apple' });

    try {
      const pass = await getPassengerAppleWalletPass(ticketId);
      const objectUrl = URL.createObjectURL(pass);

      try {
        const link = document.createElement('a');

        link.href = objectUrl;
        link.download = `boleto-${ticketId}.pkpass`;

        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        // Dar tiempo al navegador para iniciar la descarga.
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch (err) {
      setWalletError({
        ticketId,
        message:
          err instanceof Error ? err.message : 'No se pudo descargar el pase de Apple Wallet.',
      });
    } finally {
      setWalletAction(null);
    }
  }

  return (
    <section className="passenger-trip-search">
      <header className="passenger-trip-search__header">
        <p className="passenger-trip-search__eyebrow">MIS VIAJES</p>

        <h1>
          {reservationId === null ? 'Mis boletos' : `Boletos de la reserva #${reservationId}`}
        </h1>

        <p>
          Consulta tus boletos emitidos, revisa la información del viaje y muestra el código QR para
          abordar.
        </p>
      </header>

      {/* Acciones principales */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}
      >
        <button
          type="button"
          className="passenger-trip-search__button"
          onClick={handleRefresh}
          disabled={loading || walletAction !== null}
        >
          {loading ? 'Actualizando...' : 'Actualizar boletos'}
        </button>

        {reservationParam !== null && <Link to="/pasajero/boletos">Ver todos mis boletos</Link>}

        <Link to="/pasajero/reservas">Mis reservas</Link>
      </div>

      {/* Estado de carga */}
      {loading && <p role="status">Cargando tus boletos...</p>}

      {/* Error de consulta */}
      {!loading && error && (
        <div role="alert" className="passenger-trip-search__error">
          <p>{error}</p>
          <p>Puedes intentar actualizar nuevamente.</p>
        </div>
      )}

      {/* Sin boletos */}
      {!loading && !error && tickets.length === 0 && (
        <div className="passenger-trip-search__results">
          <h2>Aún no tienes boletos emitidos</h2>

          <p>
            {reservationId === null
              ? 'Cuando se apruebe el pago de una reserva, sus boletos aparecerán aquí.'
              : 'Esta reserva todavía no tiene boletos emitidos.'}
          </p>

          <p>Los boletos se generan después de que el oficinista aprueba el pago.</p>

          <Link to="/pasajero/reservas">Consultar mis reservas</Link>
        </div>
      )}

      {/* Listado de boletos */}
      {!loading && !error && tickets.length > 0 && (
        <div className="passenger-trip-search__results">
          <h2>Boletos registrados</h2>

          <p>
            Tienes {tickets.length}{' '}
            {tickets.length === 1 ? 'boleto registrado' : 'boletos registrados'}.
          </p>

          <div
            style={{
              display: 'grid',
              gap: '1.5rem',
              marginTop: '1.5rem',
            }}
          >
            {tickets.map((ticket) => {
              const isValid = ticket.validity === 'valid';
              const isQrVisible = visibleQrId === ticket.id;
              const hasQrError = qrErrorId === ticket.id;

              // Identificar qué proveedor está procesando este boleto.
              const isGoogleLoading =
                walletAction?.ticketId === ticket.id && walletAction.provider === 'google';

              const isAppleLoading =
                walletAction?.ticketId === ticket.id && walletAction.provider === 'apple';

              const currentWalletError =
                walletError?.ticketId === ticket.id ? walletError.message : null;

              return (
                <article key={ticket.id} className="passenger-trip-search__card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <h3>Boleto #{ticket.id}</h3>

                      {ticket.channel === 'office' && (
                        <p className="passenger-history__channel">Comprado en oficina</p>
                      )}

                      <p>
                        <strong>Código:</strong> {ticket.code}
                      </p>
                    </div>

                    <span
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        fontWeight: 600,
                        backgroundColor: isValid ? '#dcfce7' : '#f3f4f6',
                        color: isValid ? '#166534' : '#374151',
                      }}
                    >
                      {getValidityLabel(ticket.validity)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '1.5rem',
                      marginTop: '1rem',
                    }}
                  >
                    {/* Información del viaje */}
                    <div>
                      <h4>Información del viaje</h4>

                      <p>
                        <strong>Cooperativa:</strong> {ticket.cooperativeName}
                      </p>

                      <p>
                        <strong>Origen:</strong> {ticket.originCityName}
                      </p>

                      <p>
                        <strong>Destino:</strong> {ticket.destinationCityName}
                      </p>

                      <p>
                        <strong>Fecha de salida:</strong> {formatDate(ticket.departureAt)}
                      </p>

                      <p>
                        <strong>Bus:</strong> {ticket.busNumber}
                      </p>

                      <p>
                        <strong>Asiento:</strong> {ticket.seatNumber}
                      </p>
                    </div>

                    {/* Información del pasajero */}
                    <div>
                      <h4>Información del pasajero</h4>

                      <p>
                        <strong>Nombre:</strong> {ticket.passengerName}
                      </p>

                      <p>
                        <strong>Identificación:</strong> {ticket.passengerIdNumber}
                      </p>

                      <p>
                        <strong>Categoría:</strong> {getCategoryLabel(ticket.passengerCategory)}
                      </p>

                      <p>
                        <strong>Precio:</strong> {formatMoney(ticket.price)}
                      </p>

                      <p>
                        <strong>Emitido:</strong> {formatDate(ticket.issuedAt)}
                      </p>

                      {ticket.reservationId !== null && (
                        <p>
                          <strong>Reserva:</strong> #{ticket.reservationId}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Código QR y opciones de Wallet */}
                  <div
                    style={{
                      borderTop: '1px solid #ddd',
                      marginTop: '1.5rem',
                      paddingTop: '1.5rem',
                    }}
                  >
                    {isValid ? (
                      <>
                        {/* Botón original del código QR */}
                        <button
                          type="button"
                          className="passenger-trip-search__button"
                          aria-expanded={isQrVisible}
                          onClick={() => handleToggleQr(ticket.id)}
                        >
                          {isQrVisible ? 'Ocultar código QR' : 'Ver código QR'}
                        </button>

                        {/* Botones para guardar el boleto en Wallet */}
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '0.75rem',
                            marginTop: '1rem',
                          }}
                        >
                          <button
                            type="button"
                            className="passenger-trip-search__button"
                            disabled={walletAction !== null}
                            onClick={() => void handleGoogleWallet(ticket.id)}
                            aria-busy={isGoogleLoading}
                          >
                            {isGoogleLoading
                              ? 'Preparando Google Wallet...'
                              : 'Agregar a Google Wallet'}
                          </button>

                          <button
                            type="button"
                            className="passenger-trip-search__button"
                            disabled={walletAction !== null}
                            onClick={() => void handleAppleWallet(ticket.id)}
                            aria-busy={isAppleLoading}
                          >
                            {isAppleLoading
                              ? 'Preparando Apple Wallet...'
                              : 'Agregar a Apple Wallet'}
                          </button>
                        </div>

                        {/* Error de generación del pase */}
                        {currentWalletError && (
                          <div
                            role="alert"
                            className="passenger-trip-search__error"
                            style={{ marginTop: '1rem' }}
                          >
                            <p>{currentWalletError}</p>
                          </div>
                        )}

                        {/* Visualización original del código QR */}
                        {isQrVisible && (
                          <div
                            style={{
                              marginTop: '1.5rem',
                              textAlign: 'center',
                            }}
                          >
                            <h4>Código QR del boleto #{ticket.id}</h4>

                            {hasQrError ? (
                              <p role="alert">
                                No se pudo cargar el código QR. Inténtalo nuevamente.
                              </p>
                            ) : (
                              <img
                                src={getPassengerTicketQrUrl(ticket.id)}
                                alt={`Código QR del boleto ${ticket.code}`}
                                width={220}
                                height={220}
                                onError={() => setQrErrorId(ticket.id)}
                                style={{
                                  display: 'block',
                                  margin: '1rem auto',
                                  padding: '0.75rem',
                                  backgroundColor: '#fff',
                                  border: '1px solid #ddd',
                                  borderRadius: '8px',
                                  maxWidth: '100%',
                                  objectFit: 'contain',
                                }}
                              />
                            )}

                            <p>Presenta este código al momento de abordar el bus.</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p>
                        Este boleto no está vigente para abordar, por lo que no se muestra su código
                        QR.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
