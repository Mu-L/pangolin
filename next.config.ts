import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import fs from "fs";
import path from "path";

const withNextIntl = createNextIntlPlugin();
// read allowedDevOrigins.json if it exists
let allowedDevOrigins: string[] = [];
const allowedDevOriginsPath = path.join(
    process.cwd(),
    "allowedDevOrigins.json"
);
if (fs.existsSync(allowedDevOriginsPath)) {
    try {
        const data = fs.readFileSync(allowedDevOriginsPath, "utf-8");
        allowedDevOrigins = JSON.parse(data);
        console.log("Loaded allowed development origins:", allowedDevOrigins);
    } catch {}
}

const nextConfig: NextConfig = {
    reactStrictMode: false,
    reactCompiler: true,
    transpilePackages: ["@novnc/novnc"],
    output: "standalone",
    allowedDevOrigins
};

export default withNextIntl(nextConfig);
