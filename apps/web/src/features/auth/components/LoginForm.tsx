export function LoginForm() {
  return (
    <form>
      <div>
        <label htmlFor="email">Correo electrónico</label>
        <input id="email" name="email" type="email" placeholder="Ingresa tu correo electrónico" />
      </div>

      <div>
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" placeholder="Ingresa tu contraseña" />
      </div>

      <button type="submit">Iniciar sesión</button>
    </form>
  );
}
