import { redirect } from "next/navigation";
import { firstDocSlug } from "@/config/docs-nav";

export default function DocsIndexPage() {
  redirect(`/docs/${firstDocSlug}`);
}
