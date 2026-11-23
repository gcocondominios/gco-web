import type { Metadata } from "next";
import { GcoProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "GCO Control — Panel Privado de Administración",
  description:
    "Sistema interno de control de gastos comunes, morosidad y conciliación bancaria — GCO Gestión de Condominios (Ley N° 21.442).",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <link rel="icon" type="image/png" href={`${basePath}/icon-192.png`} />
        <link rel="apple-touch-icon" href={`${basePath}/icon-192.png`} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface text-on-surface min-h-screen antialiased">
        <GcoProvider>{children}</GcoProvider>
      </body>
    </html>
  );
}
