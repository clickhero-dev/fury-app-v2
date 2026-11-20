import { Navigate } from 'react-router-dom';
import { HomePage } from '../home/HomePage';
import { initialDestination } from './initialDestination';

/** A Home vive sob AuthenticatedShell, com os mesmos gates das outras páginas. */
export function InitialDestinationPage() {
  if (initialDestination() === '/admin/dashboard') return <Navigate to="/admin/dashboard" replace />;
  return <HomePage />;
}
