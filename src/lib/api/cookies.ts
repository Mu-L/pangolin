import { headers } from "next/headers";

export async function authCookieHeader() {
    const otherHeaders = await headers();
    const otherHeadersObject = Object.fromEntries(
        Array.from(otherHeaders.entries()).map(([k, v]) => [k.toLowerCase(), v])
    );

    console.info(`Setting cookie... x-forwarded-for: ${otherHeadersObject["x-forwarded-for"]}`)

    return {
        headers: {
            cookie: otherHeadersObject["cookie"],
            host: otherHeadersObject["host"],
            "user-agent": otherHeadersObject["user-agent"],
            "x-forwarded-for": otherHeadersObject["x-forwarded-for"],
            "x-forwarded-host": otherHeadersObject["x-forwarded-host"],
            "x-forwarded-port": otherHeadersObject["x-forwarded-port"],
            "x-forwarded-proto": otherHeadersObject["x-forwarded-proto"],
            "x-real-ip": otherHeadersObject["x-real-ip"]
        }
    };
}
