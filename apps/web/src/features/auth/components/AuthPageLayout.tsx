import type { ReactNode } from 'react';

import '../pages/LoginPage.css';
import './LoginForm.css';
import './AccountRecovery.css';

interface AuthPageLayoutProps {
  titleId: string;
  title: string;
  description: string;
  kicker: string;
  heading: string;
  children: ReactNode;
}

/** Mismo diseño de la pantalla de inicio de sesión para las pantallas de la cuenta. */
export function AuthPageLayout(props: AuthPageLayoutProps) {
  return (
    <main className="login-page">
      <aside className="login-page__intro" aria-hidden="true">
        <p className="login-page__brand">TRANSPORTE INTERPROVINCIAL</p>
        <p className="login-page__intro-kicker">{props.kicker}</p>
        <h2>{props.heading}</h2>
      </aside>
      <section className="login-page__card" aria-labelledby={props.titleId}>
        <header className="login-page__header">
          <h1 className="login-page__title" id={props.titleId}>
            {props.title}
          </h1>
          <p className="login-page__description">{props.description}</p>
        </header>

        {props.children}
      </section>
    </main>
  );
}
