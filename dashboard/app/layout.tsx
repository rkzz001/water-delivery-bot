import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Zurutuza Pedidos",
  description: "Dashboard administrativo para gestión de pedidos",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pedidos Soda",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={geist.className}>
      <body>
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{ style: { fontSize: "1.1rem" } }}
        />
      </body>
    </html>
  );
}
