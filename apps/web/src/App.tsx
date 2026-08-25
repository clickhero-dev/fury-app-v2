import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './components/providers/ThemeProvider';
import { router } from './router';
import { queryClient } from './lib/query-client';
import { store } from './store';
import { identifyUser, resetUser, startReplay, stopReplay } from './lib/posthog';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

function bindPostHogIdentity() {
  const handleChange = () => {
    const state = store.getState();
    const { token, email, name, tenantId, plan } = state.auth;
    if (token && email) {
      identifyUser({ email, name, tenantId, plan });
      startReplay();
    } else {
      stopReplay();
      resetUser();
    }
  };
  store.subscribe(handleChange);
  handleChange();
}

bindPostHogIdentity();

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </QueryClientProvider>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
