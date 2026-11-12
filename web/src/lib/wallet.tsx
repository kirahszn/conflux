"use client";
// NEAR wallet login via NEAR Connect (@hot-labs/near-connect), the connector docs.near.org
// recommends. Testnet only. The connector is created in the browser after mount, never
// during server rendering.
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NETWORK, RPC_URL } from "./near";

interface WalletState {
  ready: boolean; // connector initialised and session restored
  accountId: string | null;
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const walletRef = useRef<NearWalletBase | null>(null);
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let off = () => {};
    (async () => {
      try {
        const { NearConnector } = await import("@hot-labs/near-connect");
        const connector = new NearConnector({ network: NETWORK, providers: { [NETWORK]: [RPC_URL] } });
        connectorRef.current = connector;

        const onSignIn = (p: { wallet: NearWalletBase; accounts: { accountId: string }[] }) => {
          walletRef.current = p.wallet;
          setAccountId(p.accounts[0]?.accountId ?? null);
          setError(null);
        };
        const onSignOut = () => {
          walletRef.current = null;
          setAccountId(null);
        };
        connector.on("wallet:signIn", onSignIn);
        connector.on("wallet:signOut", onSignOut);
        off = () => {
          connector.off("wallet:signIn", onSignIn);
          connector.off("wallet:signOut", onSignOut);
        };

        const restored = await connector.getConnectedWallet().catch(() => null);
        if (!cancelled && restored) {
          walletRef.current = restored.wallet;
          setAccountId(restored.accounts[0]?.accountId ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Wallet connector failed to load");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  const signIn = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    setBusy(true);
    setError(null);
    try {
      const wallet = await connector.connect();
      walletRef.current = wallet;
      const accounts = await wallet.getAccounts();
      setAccountId(accounts[0]?.accountId ?? null);
    } catch (e) {
      // Closing the wallet picker rejects too; only show real errors.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel|closed|reject/i.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    setBusy(true);
    try {
      await connector.disconnect(walletRef.current ?? undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      walletRef.current = null;
      setAccountId(null);
      setBusy(false);
    }
  }, []);

  return (
    <WalletContext.Provider value={{ ready, accountId, busy, error, signIn, signOut }}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
