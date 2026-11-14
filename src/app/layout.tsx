import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

/** Colore la barre du navigateur mobile aux couleurs de la feutrine. */
export const viewport: Viewport = {
  themeColor: "#065f46",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://poker-trainer.fr"),
  title: {
    default: "Poker Trainer — automatismes NL Hold'em",
    template: "%s · Poker Trainer",
  },
  description:
    "Table d'entraînement NL Hold'em : cote du pot, outs, équité et push/fold en direct contre des bots. Drills, mode examen et répétition espacée pour créer de vrais automatismes.",
  openGraph: {
    title: "Poker Trainer",
    description:
      "Crée tes automatismes de calcul au poker : cote du pot, outs, équité, push/fold — contre des bots, sans argent réel.",
    url: "https://poker-trainer.fr",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
