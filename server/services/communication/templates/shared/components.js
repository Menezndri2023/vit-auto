import { BRAND } from "./base.js";

export function btn(label, url, style = "primary") {
  const colors = {
    primary: { bg: BRAND.accent,   text: "#000000" },
    dark:    { bg: BRAND.primary,  text: "#ffffff" },
    success: { bg: BRAND.success,  text: "#ffffff" },
    danger:  { bg: BRAND.danger,   text: "#ffffff" },
    outline: { bg: "transparent",  text: BRAND.primary, border: `2px solid ${BRAND.primary}` },
  };
  const c = colors[style] || colors.primary;
  const borderStyle = c.border ? `border:${c.border};` : "";
  // Un `url` manquant produirait un href="undefined" cliquable — un bouton mort
  // plutôt qu'une simple absence d'action. Repli sur le site plutôt que rien.
  const safeUrl = url || BRAND.baseUrl;
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
    <tr>
      <td align="center">
        <a href="${safeUrl}" class="btn"
          style="display:inline-block;background:${c.bg};color:${c.text};${borderStyle}text-decoration:none;
                 padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;
                 letter-spacing:.3px;mso-padding-alt:14px 32px;line-height:1"
          target="_blank">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

export function divider(color = BRAND.border, margin = "24px 0") {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${margin}">
    <tr><td style="border-top:1px solid ${color};font-size:0;line-height:0">&nbsp;</td></tr>
  </table>`;
}

export function infoBox(content, type = "info") {
  const colors = {
    info:    { border: BRAND.accent,   bg: "#fffbeb" },
    success: { border: BRAND.success,  bg: "#f0fdf4" },
    warning: { border: BRAND.warning,  bg: "#fffbeb" },
    danger:  { border: BRAND.danger,   bg: "#fef2f2" },
    neutral: { border: BRAND.border,   bg: "#f8fafc" },
  };
  const c = colors[type] || colors.info;
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${c.bg};border-left:4px solid ${c.border};border-radius:0 8px 8px 0;margin:16px 0">
    <tr><td style="padding:16px 20px;font-size:14px;line-height:1.6;color:${BRAND.text}">${content}</td></tr>
  </table>`;
}

export function badge(label, color = BRAND.accent) {
  return `<span style="display:inline-block;background:${color}22;color:${color};border:1px solid ${color}44;
           border-radius:20px;padding:3px 12px;font-size:12px;font-weight:600;letter-spacing:.5px">${label}</span>`;
}

export function dataRow(label, value, highlight = false) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-size:13px;color:${BRAND.muted};width:50%">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};font-size:14px;color:${highlight ? BRAND.accent : BRAND.text};font-weight:${highlight ? "700" : "500"};text-align:right">${value}</td>
  </tr>`;
}

export function dataTable(rows) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">
    <tbody>${rows.map(([l, v, h]) => dataRow(l, v, h)).join("")}</tbody>
  </table>`;
}

export function heroSection(title, subtitle, emoji = "") {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${BRAND.primary};border-radius:12px;margin:0 0 28px;overflow:hidden">
    <tr>
      <td style="padding:28px 32px;text-align:center">
        ${emoji ? `<div style="font-size:40px;margin-bottom:12px">${emoji}</div>` : ""}
        <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:0 0 8px;line-height:1.3">${title}</h1>
        ${subtitle ? `<p style="color:#94a3b8;font-size:14px;margin:0;line-height:1.5">${subtitle}</p>` : ""}
      </td>
    </tr>
  </table>`;
}

export function greeting(firstName) {
  return `<p style="font-size:16px;color:${BRAND.text};margin:0 0 20px">Bonjour <strong>${firstName}</strong>,</p>`;
}

export function signature(name = "L'équipe VIT AUTO") {
  return `${divider()}
  <p style="font-size:14px;color:${BRAND.muted};margin:16px 0 4px">Cordialement,</p>
  <p style="font-size:15px;font-weight:700;color:${BRAND.primary};margin:0">${name}</p>
  <p style="font-size:12px;color:${BRAND.muted};margin:4px 0 0">
    <a href="mailto:${BRAND.support}" style="color:${BRAND.accent};text-decoration:none">${BRAND.support}</a>
  </p>`;
}

export function stepTimeline(steps) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
    ${steps.map((s, i) => `
    <tr>
      <td width="32" valign="top" style="padding:0 12px 20px 0">
        <div style="width:28px;height:28px;border-radius:50%;background:${s.done ? BRAND.success : (s.active ? BRAND.accent : BRAND.border)};
             color:${s.done || s.active ? "#fff" : BRAND.muted};text-align:center;line-height:28px;font-size:13px;font-weight:700">
          ${s.done ? "✓" : i + 1}
        </div>
        ${i < steps.length - 1 ? `<div style="width:2px;height:20px;background:${BRAND.border};margin:4px auto 0"></div>` : ""}
      </td>
      <td valign="top" style="padding-bottom:20px">
        <p style="font-size:14px;font-weight:600;color:${s.active ? BRAND.primary : (s.done ? BRAND.success : BRAND.muted)};margin:4px 0 2px">${s.label}</p>
        ${s.desc ? `<p style="font-size:12px;color:${BRAND.muted};margin:0">${s.desc}</p>` : ""}
      </td>
    </tr>`).join("")}
  </table>`;
}
