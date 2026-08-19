import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wagyu-aanbieding — de beste wagyu-deals van vandaag",
  description:
    "Dagelijkse scan van Nederlandse wagyu-webshops, gesorteerd op korting en prijs per kilo.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
