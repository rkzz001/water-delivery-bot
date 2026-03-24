import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Panel de Pedidos — Fábrica de Soda",
  description: "Dashboard administrativo para gestión de pedidos",
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
