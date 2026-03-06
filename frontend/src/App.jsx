import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { MapProvider } from './context/MapContext';
import PrivateRoute from './components/auth/PrivateRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Camions from './pages/Camions';
import Arrets from './pages/Arrets';
import GestionPoi from './pages/GestionPoi';
import './index.css';
import OuverturePorte from './pages/OuverturePorte';
import Administration from './pages/Administration';

function App() {
    return (
        <AuthProvider>
            <MapProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route
                            path="/"
                            element={
                                <PrivateRoute>
                                    <Dashboard />
                                </PrivateRoute>
                            }
                        />
                        <Route
                            path="/camions"
                            element={
                                <PrivateRoute>
                                    <Camions />
                                </PrivateRoute>
                            }
                        />
                        <Route
                            path="/suivi-arret"
                            element={
                                <PrivateRoute>
                                    <Arrets />
                                </PrivateRoute>
                            }
                        />
                        <Route
                            path="/ouverture-porte"
                            element={
                                <PrivateRoute>
                                    <OuverturePorte />
                                </PrivateRoute>
                            }
                        />
                        <Route
                            path="/gestion-poi"
                            element={
                                <PrivateRoute>
                                    <GestionPoi />
                                </PrivateRoute>
                            }
                        />
                        <Route
                            path="/administration"
                            element={
                                <PrivateRoute>
                                    <Administration />
                                </PrivateRoute>
                            }
                        />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </BrowserRouter>
            </MapProvider>
        </AuthProvider>
    );
}

export default App;
