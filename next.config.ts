import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
    reactStrictMode: false,
    reactCompiler: true,
    transpilePackages: ["@novnc/novnc"],
    output: "standalone"
};

export default withNextIntl(nextConfig);
