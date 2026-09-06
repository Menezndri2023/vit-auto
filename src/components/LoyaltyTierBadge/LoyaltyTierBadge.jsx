import styles from "./LoyaltyTierBadge.module.css";

const TIER_STYLE = {
  bronze: { emoji: "🥉", className: "bronze" },
  argent: { emoji: "🥈", className: "argent" },
  or:     { emoji: "🥇", className: "or" },
};

export default function LoyaltyTierBadge({ tierKey, label, size = "md" }) {
  const style = TIER_STYLE[tierKey] || TIER_STYLE.bronze;
  return (
    <span className={`${styles.badge} ${styles[style.className]} ${styles[size] || ""}`}>
      {style.emoji} {label}
    </span>
  );
}
