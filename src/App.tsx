import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SessionProvider } from './context/SessionContext';
import { SettingsProvider } from './context/SettingsContext';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import Home from './pages/index';
import Game from './pages/Game/index';
import Sessions from './pages/Game/Sesions/index';
import Settings from './pages/Game/Settings/index';
import Profile from './pages/Profile';
import NotFound from './pages/NotFound';
import ROUTES from './lib/routes';


function Private({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-blue-600 animate-spin" />
            </div>
        );
    }
    return user ? <>{children}</> : <Navigate to={ROUTES.LOGIN} replace />;
}

function AppRoutes() {
    const { user } = useAuth();

    return (
        <Routes>
            <Route path={ROUTES.HOME}            element={user ? <Navigate to={ROUTES.GAME} replace /> : <Home />} />
            <Route path={ROUTES.LOGIN}           element={user ? <Navigate to={ROUTES.GAME} replace /> : <Login />} />
            <Route path={ROUTES.REGISTER}        element={user ? <Navigate to={ROUTES.GAME} replace /> : <Register />} />
            <Route path={ROUTES.FORGOT_PASSWORD} element={<ForgotPassword />} />
            <Route path={ROUTES.GAME}            element={<Private><SessionProvider><Game /></SessionProvider></Private>} />
            <Route path={ROUTES.GAME_SESSIONS}   element={<Private><SessionProvider><Sessions /></SessionProvider></Private>} />
            <Route path={ROUTES.GAME_SETTINGS}   element={<Private><Settings /></Private>} />
            <Route path={ROUTES.PROFILE}         element={<Private><Profile /></Private>} />
            <Route path="*"                      element={<NotFound />} />
        </Routes>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <SettingsProvider>
                    <BrowserRouter>
                        <AppRoutes />
                    </BrowserRouter>
                </SettingsProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
