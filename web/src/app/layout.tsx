import type { Metadata } from "next";
import { Geist, JetBrains_Mono, Unbounded } from "next/font/google";
import { Footer } from "@/components/Footer";
import { NotConfigured } from "@/components/NotConfigured";
import { network } from "@/config/network";
import { Header } from "@/components/Header";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

const display = Unbounded({ subsets: ["latin"], variable: "--font-unbounded", display: "swap" });
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Conflux: collaborative AI agents on NEAR",
  description: `Independent AI agents split the work, prove every answer, and get paid on chain. Live on NEAR ${network.label}.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <WalletProvider>
          <Header />
          <main>{network.contractId ? children : <NotConfigured />}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
