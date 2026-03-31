"use server";

import { cookies, headers } from "next/headers";
import { Locale, defaultLocale, locales } from "@/i18n/config";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";

// In this example the locale is read from a cookie. You could alternatively
// also read it from a database, backend service, or any other source.
const COOKIE_NAME = "NEXT_LOCALE";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

export async function getUserLocale(): Promise<Locale> {
    const cookieLocale = (await cookies()).get(COOKIE_NAME)?.value;

    if (cookieLocale && locales.includes(cookieLocale as Locale)) {
        return cookieLocale as Locale;
    }

    // No cookie found — try to restore from user's saved locale in DB
    try {
        const res = await internal.get("/user", await authCookieHeader());
        const userLocale = res.data?.data?.locale;
        if (userLocale && locales.includes(userLocale as Locale)) {
            // Set the cookie so subsequent requests don't need the API call
            (await cookies()).set(COOKIE_NAME, userLocale, {
                maxAge: COOKIE_MAX_AGE,
                path: "/",
                sameSite: "lax"
            });
            return userLocale as Locale;
        }
    } catch {
        // User not logged in or API unavailable — fall through
    }

    const headerList = await headers();
    const acceptLang = headerList.get("accept-language");

    if (acceptLang) {
        const browserLang = acceptLang.split(",")[0];
        const matched = locales.find((locale) =>
            browserLang
                .toLowerCase()
                .startsWith(locale.split("-")[0].toLowerCase())
        );
        if (matched) {
            return matched;
        }
    }

    return defaultLocale;
}

export async function setUserLocale(locale: Locale) {
    (await cookies()).set(COOKIE_NAME, locale, {
        maxAge: COOKIE_MAX_AGE,
        path: "/",
        sameSite: "lax"
    });
}
