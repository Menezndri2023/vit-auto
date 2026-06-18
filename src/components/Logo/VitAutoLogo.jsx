import { useId } from "react";

/**
 * VIT-AUTO logo — monogramme VA vectoriel fidèle au logo officiel.
 *
 * @param {number}  iconSize  diamètre du cercle en px (défaut 48)
 * @param {"color"|"white"} variant  "color" = fond clair, "white" = fond sombre
 * @param {boolean} showText  affiche "VIT-AUTO" à côté de l'icône
 * @param {boolean} tagline   affiche "Achetez. Louez. Roulez." (nécessite showText)
 */
const VitAutoLogo = ({
  iconSize = 48,
  variant  = "color",
  showText = false,
  tagline  = false,
  style    = {},
}) => {
  const uid    = useId();
  const clipId = `clip-${uid}`;
  const bgId   = `bg-${uid}`;

  const navy   = variant === "white" ? "#ffffff" : "#162040";
  const orange = "#f47d20";

  const textNavy  = navy;
  const borderCol = navy;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: showText ? `${Math.round(iconSize * 0.27)}px` : 0,
        userSelect: "none",
        textDecoration: "none",
        ...style,
      }}
    >
      {/* ═══════════ Cercle VA ═══════════ */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0, display: "block" }}
      >
        <defs>
          {/* Fond intérieur du cercle */}
          {variant === "white" ? (
            <radialGradient id={bgId} cx="45%" cy="38%" r="65%">
              <stop offset="0%"   stopColor="rgba(255,255,255,0.15)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
            </radialGradient>
          ) : (
            <radialGradient id={bgId} cx="40%" cy="35%" r="70%">
              <stop offset="0%"   stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#d4dae6" />
            </radialGradient>
          )}

          {/* Clip : monogramme reste dans le cercle */}
          <clipPath id={clipId}>
            <circle cx="100" cy="100" r="90" />
          </clipPath>
        </defs>

        {/* ── Fond ── */}
        <circle cx="100" cy="100" r="95" fill={`url(#${bgId})`} />

        {/* ── Monogramme VA ─────────────────────────────────────── */}
        <g clipPath={`url(#${clipId})`}>

          {/* V ORANGE — bras gauche (haut-gauche → bas-centre) */}
          <polygon points="15,22 45,22 88,162 74,162" fill={orange} />

          {/* V ORANGE — bras droit (bas-centre → hauteur mi-droite)
              Le bras droit monte seulement jusqu'à ~y=22 pour chevaucher le A */}
          <polygon points="74,162 88,162 130,22 104,22" fill={orange} />

          {/* A MARINE — jambe gauche (sommet droite → bas, chevauchant V) */}
          <polygon points="112,22 138,22 108,162 80,162" fill={navy} />

          {/* A MARINE — jambe droite (sommet droite → bas-droit) */}
          <polygon points="112,22 138,22 178,162 152,162" fill={navy} />

          {/* A MARINE — barre transversale */}
          <rect x="93" y="85" width="66" height="18" rx="2" fill={navy} />

        </g>

        {/* ── Bordure du cercle ── */}
        <circle
          cx="100" cy="100" r="93"
          fill="none"
          stroke={borderCol}
          strokeWidth="10"
        />
      </svg>

      {/* ═══════════ Texte ═══════════ */}
      {showText && (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span
            style={{
              fontFamily: "'Poppins', 'Arial Black', sans-serif",
              fontWeight: 900,
              fontSize: `${Math.round(iconSize * 0.58)}px`,
              color: orange,
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            VIT-AUTO
          </span>
          {tagline && (
            <span
              style={{
                fontFamily: "'Poppins', Arial, sans-serif",
                fontWeight: 600,
                fontSize: `${Math.round(iconSize * 0.22)}px`,
                color: variant === "white" ? "rgba(255,255,255,0.65)" : "#8a9bbf",
                marginTop: "3px",
                letterSpacing: "0.01em",
              }}
            >
              Achetez. Louez. Roulez.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default VitAutoLogo;
