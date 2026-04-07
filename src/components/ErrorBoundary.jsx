import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Booking ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          maxWidth: '500px',
          margin: '0 auto'
        }}>
          <h1 style={{ color: '#dc3545' }}>Une erreur s&apos;est produite</h1>
          <p>Impossible de charger la page de réservation. Essayez de rafraîchir ou de revenir en arrière.</p>
          <details style={{ margin: '1rem 0', textAlign: 'left' }}>
            <summary>Détails techniques (cliquez pour voir)</summary>
            <pre style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
              {this.state.error?.message || 'Erreur inconnue'}
            </pre>
          </details>
          <div style={{ marginTop: '2rem' }}>
            <button 
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: '#007bff',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '1rem'
              }}
            >
              Réessayer
            </button>
            <button 
              onClick={() => window.history.back()}
              style={{
                background: '#6c757d',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Retour
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
