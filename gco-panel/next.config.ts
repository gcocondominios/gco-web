import type { NextConfig } from "next";

const isStaticExport = process.env.GCO_STATIC_EXPORT === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  ...(basePath ? { basePath } : {}),
  ...(!isStaticExport
    ? {
        async headers() {
          return [
            {
              source: "/(.*)",
              headers: [
                { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "X-Content-Type-Options", value: "nosniff" },
                {
                  key: "Referrer-Policy",
                  value: "strict-origin-when-cross-origin",
                },
              ],
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
