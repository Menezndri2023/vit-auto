// Drapeaux en SVG (2026-11-02) : les émojis-drapeaux s'affichent en lettres
// (« MA », « FR ») sous Windows, qui ne les dessine pas. Les pays présentés au
// public sont dessinés ici, sans requête externe ; les autres retombent sur
// l'émoji fourni.
const DESSINS = {
  MA: (
    <>
      <rect width="30" height="20" fill="#c1272d" />
      <path d="M15 6.2l1.06 3.26h3.43l-2.77 2.02 1.06 3.26L15 12.72l-2.78 2.02 1.06-3.26-2.77-2.02h3.43z"
        fill="none" stroke="#006233" strokeWidth="0.9" />
    </>
  ),
  FR: (
    <>
      <rect width="10" height="20" fill="#0055a4" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ef4135" />
    </>
  ),
  CN: (
    <>
      <rect width="30" height="20" fill="#de2910" />
      <path d="M5 2.5l.9 2.75h2.9L6.47 6.95l.9 2.75L5 8l-2.37 1.7.9-2.75L1.2 5.25h2.9z" fill="#ffde00" />
      {[[10, 2], [12, 4], [12, 7], [10, 9]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="#ffde00" />)}
    </>
  ),
  AE: (
    <>
      <rect width="30" height="20" fill="#fff" />
      <rect width="30" height="6.67" fill="#00732f" />
      <rect y="13.33" width="30" height="6.67" fill="#000" />
      <rect width="8" height="20" fill="#ff0000" />
    </>
  ),
};

export default function Drapeau({ code, emoji = "", titre, taille = 18 }) {
  const dessin = DESSINS[String(code || "").toUpperCase()];
  if (!dessin) return <span aria-hidden={titre ? undefined : "true"} title={titre}>{emoji}</span>;
  return (
    <svg viewBox="0 0 30 20" width={taille * 1.5} height={taille} role={titre ? "img" : undefined}
      aria-label={titre} aria-hidden={titre ? undefined : "true"}
      style={{ borderRadius: 2, boxShadow: "0 0 0 1px rgba(15,27,63,.12)", flexShrink: 0, verticalAlign: "middle" }}>
      {dessin}
    </svg>
  );
}
