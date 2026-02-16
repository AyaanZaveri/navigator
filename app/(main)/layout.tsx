import { JotaiProvider } from "@/components/jotai-provider";
import { FullscreenDetector } from "@/components/fullscreen-detector";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LayoutContent } from "@/components/layout-content";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <JotaiProvider>
      <FullscreenDetector />
      <KeyboardShortcuts />
      <LayoutContent>{children}</LayoutContent>
    </JotaiProvider>
  );
}
