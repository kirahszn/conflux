import type { Metadata } from "next";
import { WalletCheck } from "@/components/WalletCheck";

export const metadata: Metadata = { title: "Wallet check · Conflux" };

export default function WalletCheckPage() {
  return <WalletCheck />;
}
