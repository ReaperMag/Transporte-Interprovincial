import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

const heroImages = Array.from(
  { length: 5 },
  (_, index) => `${import.meta.env.BASE_URL}images/home-carousel/slide-${index + 1}.png`,
);

export function PublicLayout() {
  return (
    <div className="public-site">
      <header className="public-site__header">
        <nav className="public-site__nav" aria-label="Navegación principal">
          <Link className="public-site__brand" to="/">
            <span aria-hidden="true">▰</span>
            <span>
              TRANSPORTE <small>Interprovincial</small>
            </span>
          </Link>
          <div className="public-site__links">
            <NavLink to="/" end>
              Inicio
            </NavLink>
            <NavLink to="/viajes">Viajes disponibles</NavLink>
          </div>
          <div className="public-site__account">
            <Link to="/login">Iniciar sesión</Link>
            <Link to="/signup">Crear cuenta</Link>
          </div>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export function PublicHomePage() {
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % heroImages.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="public-home">
      <section className="public-home__hero">
        <div className="public-home__hero-background" aria-hidden="true">
          {heroImages.map((image, index) => (
            <div
              key={image}
              className={`public-home__hero-slide${index === activeImage ? ' is-active' : ''}`}
              style={{ backgroundImage: `url("${image}")` }}
            />
          ))}
        </div>
        <div className="public-home__hero-content">
          <p className="public-home__eyebrow">TRANSPORTE INTERPROVINCIAL</p>
          <h1>Tu próximo destino está más cerca</h1>
          <p>
            Descubre rutas, compara horarios y organiza tus viajes en un solo lugar. Encuentra tu
            próxima salida y reserva tu asiento al iniciar sesión.
          </p>
          <div className="public-home__hero-actions">
            <Link className="public-home__primary" to="/viajes">
              Explorar viajes <span aria-hidden="true">→</span>
            </Link>
            <Link className="public-home__secondary" to="/signup">
              Crear una cuenta
            </Link>
          </div>
        </div>
      </section>

      <section className="public-home__features" aria-labelledby="public-features-title">
        <div className="public-home__section-heading">
          <p className="public-home__eyebrow">VIAJA A TU MANERA</p>
          <h2 id="public-features-title">Todo lo que necesitas para tu viaje</h2>
          <p>Conoce las herramientas que te acompañan desde la búsqueda hasta la salida.</p>
        </div>
        <div className="public-home__feature-grid">
          <article>
            <span className="public-home__feature-icon" aria-hidden="true">
              ⌕
            </span>
            <h3>Encuentra tu ruta</h3>
            <p>Consulta viajes disponibles y filtra por origen, destino y fecha.</p>
            <Link to="/viajes">
              Ver viajes <span aria-hidden="true">→</span>
            </Link>
          </article>
          <article>
            <span className="public-home__feature-icon" aria-hidden="true">
              ▦
            </span>
            <h3>Elige tu asiento</h3>
            <p>Inicia sesión para seleccionar tu asiento y realizar una reserva.</p>
            <Link to="/login">
              Iniciar sesión <span aria-hidden="true">→</span>
            </Link>
          </article>
          <article>
            <span className="public-home__feature-icon" aria-hidden="true">
              ◇
            </span>
            <h3>Gestiona tus boletos</h3>
            <p>Consulta tus reservas y boletos desde tu cuenta de pasajero.</p>
            <Link to="/signup">
              Crear cuenta <span aria-hidden="true">→</span>
            </Link>
          </article>
        </div>
      </section>
    </div>
  );
}
