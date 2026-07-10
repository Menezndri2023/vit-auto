import { useState } from "react";
import { Link } from "react-router-dom";

const Art = ({ n, title, children }) => (
  <div style={{ marginBottom: 32 }}>
    <h3 style={{
      fontSize: "0.95rem", fontWeight: 800, color: "#0f1b3f",
      marginBottom: 10, display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span style={{
        background: "#ff4d2d", color: "#fff", fontSize: "0.7rem",
        fontWeight: 900, padding: "3px 9px", borderRadius: 999, flexShrink: 0,
        marginTop: 2, whiteSpace: "nowrap",
      }}>{n}</span>
      {title}
    </h3>
    <div style={{ color: "#4a5876", fontSize: "0.88rem", lineHeight: 1.75, paddingLeft: 4 }}>
      {children}
    </div>
  </div>
);

const Li = ({ children }) => (
  <li style={{ marginBottom: 6, display: "flex", gap: 8 }}>
    <span style={{ color: "#ff4d2d", flexShrink: 0, marginTop: 2 }}>›</span>
    <span>{children}</span>
  </li>
);

const TABS = [
  { id: "loi",        label: "📄 Letter of Intent" },
  { id: "agreement",  label: "🤝 Founding Partner Agreement" },
  { id: "policy",     label: "🛡️ Partner Verification Policy" },
];

export default function FoundingPartnerLegal() {
  const [tab, setTab] = useState("loi");

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 96px" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f1b3f 0%, #1e3a6e 100%)",
        borderRadius: 20, padding: "36px 36px 32px", marginBottom: 32, color: "#fff",
      }}>
        <span style={{
          display: "inline-block", background: "rgba(255,77,45,.18)", color: "#ff8060",
          fontSize: "0.72rem", fontWeight: 800, padding: "4px 14px",
          borderRadius: 999, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16,
        }}>🌟 FOUNDING PARTNER PROGRAM — LEGAL FRAMEWORK</span>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(1.5rem,2.5vw,2rem)", fontWeight: 900 }}>
          Legal Documents
        </h1>
        <p style={{ margin: 0, color: "rgba(255,255,255,.7)", fontSize: "0.88rem", lineHeight: 1.6, maxWidth: 640 }}>
          VIT-AUTO operates the Founding Partner Program under a structured legal framework.
          Below are the three documents that govern the relationship between VIT-AUTO and its
          Founding Partners — read them before applying.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "9px 16px", borderRadius: 10, border: tab === t.id ? "none" : "1.5px solid #e2e8f0",
              background: tab === t.id ? "#0f1b3f" : "#fff",
              color: tab === t.id ? "#fff" : "#374151",
              fontWeight: 700, fontSize: "0.82rem", cursor: "pointer",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Letter of Intent ── */}
      {tab === "loi" && (
        <div>
          <div style={{
            background: "rgba(255,77,45,.06)", border: "1px solid rgba(255,77,45,.2)",
            borderRadius: 14, padding: "16px 20px", marginBottom: 28,
          }}>
            <p style={{ margin: 0, color: "#0f1b3f", fontSize: "0.86rem", lineHeight: 1.7 }}>
              This is a preview of the standard Letter of Intent. Upon application, VIT-AUTO
              generates a personalized version referencing your company and application number,
              which you accept electronically as part of the Founding Partner application.
            </p>
          </div>

          <p style={{ color: "#64748b", fontSize: "0.82rem", marginBottom: 24 }}>
            Between <strong>VIT-AUTO</strong> — International Automotive Services Platform, Route 1029,
            Hay Sidi Maârouf, Casablanca, Morocco, represented by Manassé N'DRI N'GUESSAN, Founder &amp; CEO
            (the "Platform") — and the applying company (the "Founding Partner").
          </p>

          <Art n="1" title="Purpose">
            This Letter of Intent ("LOI") expresses the mutual intention of both parties to explore
            a long-term business relationship focused on:
            <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
              <Li>International vehicle sales and export opportunities</Li>
              <Li>Promotion of the Founding Partner's inventory through the VIT-AUTO platform</Li>
              <Li>Connection with qualified buyers, dealerships, rental companies, and fleet operators across Africa and other international markets</Li>
              <Li>Future cooperation in automotive services, logistics, and digital commerce solutions</Li>
            </ul>
          </Art>

          <Art n="2" title="Founding Partner Status">
            Upon approval by VIT-AUTO's verification team, the applying company may receive the
            status of "Verified Founding Partner" and benefit from:
            <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
              <Li>Priority visibility on the platform</Li>
              <Li>Founding Partner recognition badge on all listings</Li>
              <Li>Early access to platform features and services</Li>
              <Li>Preferential commercial conditions during the launch phase (see the Founding Partner Agreement)</Li>
              <Li>Direct communication with the VIT-AUTO Partner Success Team</Li>
            </ul>
          </Art>

          <Art n="3" title="Non-Binding Nature">
            This Letter of Intent is non-binding and does not create an exclusive relationship between
            the parties. Both parties remain free to continue discussions, evaluate opportunities, and
            decide whether to enter into the formal Founding Partner Agreement.
          </Art>

          <Art n="4" title="Good Faith Cooperation">
            Both parties agree to cooperate in good faith, share accurate business information, and
            work toward building a trusted international automotive network.
          </Art>

          <Art n="5" title="Acceptance">
            By submitting the Founding Partner application on VIT-AUTO, the applicant acknowledges
            that they have read and accepted this Letter of Intent.
          </Art>
        </div>
      )}

      {/* ── Founding Partner Agreement ── */}
      {tab === "agreement" && (
        <div>
          <div style={{
            background: "rgba(255,77,45,.06)", border: "1px solid rgba(255,77,45,.2)",
            borderRadius: 14, padding: "16px 20px", marginBottom: 28,
          }}>
            <p style={{ margin: 0, color: "#0f1b3f", fontSize: "0.86rem", lineHeight: 1.7 }}>
              This is a preview of the standard Founding Partner Agreement. The final, binding
              version is generated once your application is approved and is signed electronically
              through your Partner Portal.
            </p>
          </div>

          <Art n="1" title="Purpose">
            This Founding Partner Agreement defines the terms under which an approved company joins
            VIT-AUTO as a Founding Partner and benefits from preferential conditions in recognition
            of early commitment.
          </Art>

          <Art n="2" title="Founding Partner Status">
            The Partner is recognized as a Founding Partner of VIT-AUTO, member of the exclusive
            first cohort, limited to <strong>20 partners</strong>. This status is non-transferable and
            permanently recorded in the Partner profile under a unique reference number. The exclusive
            "Founding Partner" badge is displayed on all Partner listings for the duration of the
            partnership.
          </Art>

          <Art n="3" title="Commercial Conditions">
            Preferential rates are guaranteed for 12 months from activation:
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e2e8f0" }}>Transaction Type</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e2e8f0" }}>Standard Rate</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e2e8f0" }}>Founding Partner Rate</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>Vehicle Rental</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>15%</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#059669" }}>10%</td></tr>
                  <tr><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>Vehicle Sales</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>3%</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#059669" }}>2%</td></tr>
                  <tr><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>Professional Driver</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }}>10%</td><td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: "#059669" }}>10%</td></tr>
                  <tr><td style={{ padding: "8px 10px" }}>Premium Subscription</td><td style={{ padding: "8px 10px" }}>Paid</td><td style={{ padding: "8px 10px", fontWeight: 700, color: "#059669" }}>FREE (12 months)</td></tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 10 }}>
              After the 12-month period, standard rates apply unless renewed by mutual written agreement.
              Commission rates are locked from the Agreement signing date.
            </p>
          </Art>

          <Art n="4" title="Independence of the Parties">
            The Founding Partner remains an independent company and is solely responsible for vehicle
            pricing, sales negotiations, payment collection, export documentation, shipping arrangements,
            after-sales obligations, and compliance with local and international regulations. VIT-AUTO
            acts as a digital business platform and does not become the owner or seller of the vehicles.
          </Art>

          <Art n="5" title="Partner Obligations">
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <Li>Maintain accurate and up-to-date listings on the platform</Li>
              <Li>Respond to customer inquiries within 48 hours maximum</Li>
              <Li>Uphold VIT-AUTO quality and compliance standards</Li>
              <Li>Keep all verification documents current and valid</Li>
              <Li>Comply with all applicable laws in countries of operation</Li>
              <Li>Not engage in fraudulent or misleading practices</Li>
            </ul>
          </Art>

          <Art n="6" title="Inventory Integration">
            To simplify inventory management, VIT-AUTO may support API integration, XML feeds, CSV
            imports, Dealer Management System (DMS) integrations, and other compatible synchronization
            methods. The Founding Partner remains responsible for the accuracy and legality of all
            inventory data provided to VIT-AUTO.
          </Art>

          <Art n="7" title="Intellectual Property &amp; Confidentiality">
            The Partner grants VIT-AUTO a non-exclusive license to use submitted logos, photos, and
            media for platform display; each party retains rights to its own content. Both parties
            agree to keep the commercial terms of this Agreement confidential.
          </Art>

          <Art n="8" title="Verification &amp; Compliance">
            VIT-AUTO reserves the right to verify company documents, business licenses, export
            authorizations, and other relevant information before granting or maintaining Founding
            Partner status — see the Partner Verification Policy below.
          </Art>

          <Art n="9" title="Term, Termination &amp; Dispute Resolution">
            This Agreement is valid for 24 months from signing. Either party may terminate with 30
            days' written notice after the initial 12-month period; VIT-AUTO may terminate immediately
            for fraud or material breach. Disputes are resolved first through good-faith negotiation,
            then through arbitration under applicable international commercial law.
          </Art>
        </div>
      )}

      {/* ── Partner Verification Policy ── */}
      {tab === "policy" && (
        <div>
          <div style={{
            background: "rgba(255,77,45,.06)", border: "1px solid rgba(255,77,45,.2)",
            borderRadius: 14, padding: "16px 20px", marginBottom: 28,
          }}>
            <p style={{ margin: 0, color: "#0f1b3f", fontSize: "0.86rem", lineHeight: 1.7 }}>
              VIT-AUTO is committed to building a trusted international automotive network. This
              policy protects buyers and professional partners alike.
            </p>
          </div>

          <Art n="1" title="Why Verification Matters">
            Verification allows VIT-AUTO to maintain a reliable ecosystem for international buyers,
            dealerships, rental companies, and automotive professionals. Every company applying for
            the Founding Partner Program is reviewed before being granted "Verified Founding Partner"
            status.
          </Art>

          <Art n="2" title="Documents That May Be Requested">
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <Li>Business registration certificate</Li>
              <Li>Company address and contact information</Li>
              <Li>Export license or automotive business authorization (if applicable)</Li>
              <Li>Company website or business profile</Li>
              <Li>Identity of the authorized representative</Li>
              <Li>Additional documents requested by the verification team</Li>
            </ul>
          </Art>

          <Art n="3" title="Review Process">
            Approval as a "Verified Founding Partner" is granted after successful review by the
            VIT-AUTO Partner Verification Team. VIT-AUTO may request additional information or
            clarification at any stage, and reserves the right to decline an application that does
            not meet the platform's standards.
          </Art>

          <Art n="4" title="Ongoing Compliance">
            Verified status is not permanent by default: VIT-AUTO may periodically request updated
            documents (e.g. renewed licenses) and may suspend a Partner's verified status if
            information provided is found to be inaccurate, expired, or misleading.
          </Art>
        </div>
      )}

      <div style={{ marginTop: 40, textAlign: "center" }}>
        <Link to="/partner-onboarding" style={{
          display: "inline-flex", alignItems: "center", gap: 8, background: "#ff4d2d", color: "#fff",
          textDecoration: "none", padding: "12px 26px", borderRadius: 12, fontWeight: 800, fontSize: "0.92rem",
        }}>
          → Apply to the Founding Partner Program
        </Link>
      </div>
    </div>
  );
}
