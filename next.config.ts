import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Productfoto's komen van externe webshops; alleen https toegestaan.
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
