import {
  LayoutDashboard, ChartLine, Compass, Users, ShieldCheck, Award, SearchCheck, Layers, Crown, Target,
  Store, CarFront, Palette, Megaphone, ClipboardList, Clock, FileSignature, UserRound, Sailboat, ScrollText,
  Landmark, Umbrella, Wrench, Handshake, Cog, Globe, PackageOpen, Ship, Anchor, Truck, Container, Calculator,
  Scale, Headphones, LifeBuoy, Eye, Flag, Star, Percent, HandCoins, FileText, CreditCard, Settings, Lock,
  Bell, MessageCircle, Mail, KeyRound, History, Activity,
} from "lucide-react";

// Icônes du menu d'administration (2026-11-02) : une par onglet, à la place
// des émojis. Un onglet ajouté sans icône retombe sur son émoji.
const ICONES = {
  dashboard: LayoutDashboard, analytics: ChartLine, direction: Compass,
  users: Users, kyc: ShieldCheck, certification: Award,
  partner_verif: SearchCheck, secteurs: Layers, founding_partners: Crown, partner_crm: Target, pms_partners: Store,
  catalogue: CarFront, marketing: Palette, ads: Megaphone,
  bookings: ClipboardList, pending_validation: Clock, contrats: FileSignature, chauffeurs: UserRound,
  activites: Sailboat, rental_policies: ScrollText, financement: Landmark, assurance: Umbrella, service_requests: Wrench,
  sales_leads: Handshake, pieces: Cog,
  import_export: Globe, exportateurs: PackageOpen, dossiers_import: Ship, zone_transit: Anchor, logistique: Truck,
  transport: Container, import_cost: Calculator,
  litiges: Scale, support: Headphones, assistance: LifeBuoy, chat_supervision: Eye, reports: Flag, reviews: Star,
  commissions: Percent, reversements: HandCoins, factures: FileText, paiements: CreditCard, business_config: Settings, escrow: Lock,
  notifications: Bell, whatsapp: MessageCircle, email_delivery: Mail,
  roles: KeyRound, audit: History, system_health: Activity,
};

export default function IconeMenu({ cle, repli = "", taille = 17 }) {
  const Icone = ICONES[cle];
  return Icone ? <Icone size={taille} strokeWidth={1.9} aria-hidden="true" /> : <span aria-hidden="true">{repli}</span>;
}
