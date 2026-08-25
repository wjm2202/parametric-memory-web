import SiteNavbar from "@/components/ui/SiteNavbar";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-950 min-h-screen">
      <SiteNavbar variant="standard" />
      <div className="pt-20">{children}</div>
    </div>
  );
}
