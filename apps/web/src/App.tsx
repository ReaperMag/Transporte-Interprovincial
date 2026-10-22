import { AppRouter } from './app/router';
import { AuthProvider } from './features/auth/context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
