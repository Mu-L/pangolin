import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
    reactStrictMode: false,
    transpilePackages: ["@novnc/novnc"],
    eslint: {
        ignoreDuringBuilds: true
    },
    experimental: {
        reactCompiler: true
    },
    output: "standalone"
};

export default withNextIntl(nextConfig);
