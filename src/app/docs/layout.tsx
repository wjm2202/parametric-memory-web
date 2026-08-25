import SiteNavbar from "@/components/ui/SiteNavbar";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {

  return (
    <div className="bg-surface-950 min-h-screen">
      <SiteNavbar variant="standard" />

      {/* Mobile sidebar drawer sits above the page content */}
      <div className="pt-16 lg:hidden">
        <DocsSidebar />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8 pt-20 pb-24 lg:pt-24">
          {/* Desktop sidebar */}
          <div className="hidden lg:block">
            <DocsSidebar />
          </div>

          {/* Main content slot — child pages inject their own TOC */}
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
