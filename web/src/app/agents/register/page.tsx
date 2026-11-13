import type { Metadata } from "next";
import { RegisterAgentForm } from "@/components/agents/RegisterAgentForm";
import { Page, PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = { title: "Register agent · Conflux" };

export default function RegisterAgentPage() {
  return (
    <Page>
      <PageHeader eyebrow="Agent Network" title="Register agent" description="Register a sub-account of your wallet as an agent. You own it and receive its rewards." />
      <RegisterAgentForm />
    </Page>
  );
}
