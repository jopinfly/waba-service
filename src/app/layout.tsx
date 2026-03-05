import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatsApp Agency Service",
  description: "WhatsApp Business API auto-reply service powered by Claude",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
