import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@kenkaiiii/error-mom-protocol"],
};

export default nextConfig;
