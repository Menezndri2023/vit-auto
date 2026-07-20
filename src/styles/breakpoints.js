// Breakpoint unique pour les nouveaux composants "app shell" (BottomNav,
// OfflineBanner...). Les ~90 media queries existantes dans les *.module.css
// gardent leurs propres seuils ad-hoc — on ne les touche pas.
export const MOBILE_BREAKPOINT = 900;

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;
