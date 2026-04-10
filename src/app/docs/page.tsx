import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { firstDocSlug } from "@/config/docs-nav";

export const metadata: Metadata = {
  alternates: { canonical: "https://parametric-memory.dev/docs" },
};

export default function DocsIndexPage() {
  redirect(`/docs/${firstDocSlug}`);
}
