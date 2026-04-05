import { cookies } from "next/headers";
import SiteNavbar from "@/components/ui/SiteNavbar";

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.has("mmpm_session");

  return (
    <div className="bg-surface-950 min-h-screen">
      <SiteNavbar isLoggedIn={isLoggedIn} variant="standard" />
      <div className="pt-20">{children}</div>
    </div>
  );
}
