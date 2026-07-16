import React from 'react';
import * as Sentry from '@sentry/react';

// Textes multilingues — pas de hook (class component), on lit localStorage directement
const MSGS = {
  fr: { title: "Une erreur s'est produite", body: "Cette page a rencontré un problème. Essayez de rafraîchir ou revenez à l'accueil.", details: "Détails techniques", retry: "↺ Réessayer", home: "🏠 Accueil", reload: "⟳ Rafraîchir la page" },
  en: { title: "Something went wrong",      body: "This page encountered an error. Try refreshing or go back to the home page.",        details: "Technical details",  retry: "↺ Retry",     home: "🏠 Home",    reload: "⟳ Refresh page"   },
  ar: { title: "حدث خطأ",                  body: "واجهت هذه الصفحة خطأً. حاول التحديث أو العودة إلى الصفحة الرئيسية.",              details: "تفاصيل تقنية",      retry: "↺ إعادة المحاولة", home: "🏠 الرئيسية", reload: "⟳ تحديث الصفحة" },
  es: { title: "Se produjo un error",       body: "Esta página encontró un problema. Intenta actualizar o vuelve a la página de inicio.", details: "Detalles técnicos", retry: "↺ Reintentar", home: "🏠 Inicio",  reload: "⟳ Actualizar página" },
  zh: { title: "发生了错误",                body: "该页面遇到问题。请尝试刷新或返回首页。",                                              details: "技术细节",           retry: "↺ 重试",     home: "🏠 首页",    reload: "⟳ 刷新页面"   },
};

function getLang() {
  try { return localStorage.getItem("vit_lang") || "fr"; } catch { return "fr"; }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack?.slice(0, 200));
    // No-op silencieux si Sentry n'a jamais été initialisé (VITE_SENTRY_DSN absente).
    Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      const lang = getLang();
      const m = MSGS[lang] || MSGS.fr;

      return (
        <div style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3rem 1.5rem',
          textAlign: 'center',
          background: '#f8fafc',
          direction: lang === 'ar' ? 'rtl' : 'ltr',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: '#0f1b3f', fontSize: '1.3rem', margin: '0 0 0.75rem' }}>
            {m.title}
          </h2>
          <p style={{ color: '#64748b', marginBottom: '1.5rem', maxWidth: 400 }}>
            {m.body}
          </p>
          {this.state.error?.message && (
            <details style={{ margin: '0 0 1.5rem', textAlign: 'left', maxWidth: 480, width: '100%' }}>
              <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '0.82rem' }}>
                {m.details}
              </summary>
              <pre style={{
                background: '#f1f5f9', padding: '0.75rem', borderRadius: '8px',
                overflow: 'auto', fontSize: '0.75rem', marginTop: '0.5rem',
                color: '#dc2626', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: '#ff4d2d', color: '#fff', border: 'none',
                padding: '0.75rem 1.5rem', borderRadius: '10px',
                cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
              }}
            >
              {m.retry}
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                background: '#0f1b3f', color: '#fff', border: 'none',
                padding: '0.75rem 1.5rem', borderRadius: '10px',
                cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
              }}
            >
              {m.home}
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent', color: '#64748b',
                border: '1.5px solid #e2e8f0',
                padding: '0.75rem 1.5rem', borderRadius: '10px',
                cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
              }}
            >
              {m.reload}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
