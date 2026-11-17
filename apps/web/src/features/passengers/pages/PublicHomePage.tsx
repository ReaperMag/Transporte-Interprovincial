import { Link, Outlet } from 'react-router-dom';

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
            <Link to="/">Inicio</Link>
            <Link to="/viajes">Viajes disponibles</Link>
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
  return (
    <div className="public-home">
      <section className="public-home__hero">
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
        <svg
          className="public-home__illustration"
          viewBox="0 0 640 420"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="448" cy="158" r="115" fill="#F0BE7E" opacity=".8" />
          <path d="M0 307 140 179 226 249 344 115 640 338V420H0V307Z" fill="#27616B" />
          <path d="M0 345 155 232 248 304 378 186 640 350V420H0V345Z" fill="#174854" />
          <path d="M0 373C120 330 221 358 313 375c91 17 200-4 327-49v94H0v-47Z" fill="#D1D8C6" />
          <path
            d="M202 357h245l-23-76c-5-17-20-28-38-28H242c-15 0-27 10-30 24l-10 80Z"
            fill="#F5E9D1"
          />
          <path d="M231 278c1-7 7-12 14-12h132c12 0 23 8 26 20l5 16H226l5-24Z" fill="#31727C" />
          <path d="M317 266v36M218 320h204M209 341h222" stroke="#174854" strokeWidth="5" />
          <circle cx="250" cy="357" r="20" fill="#192D36" />
          <circle cx="390" cy="357" r="20" fill="#192D36" />
          <circle cx="250" cy="357" r="8" fill="#E8E7DD" />
          <circle cx="390" cy="357" r="8" fill="#E8E7DD" />
          <path
            d="M0 396c126-18 196-9 286 5 116 18 229 7 354-19"
            stroke="#F7F1DE"
            strokeWidth="5"
            strokeDasharray="22 18"
          />
        </svg>
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
