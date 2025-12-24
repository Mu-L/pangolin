"use client";

import { useEffect } from "react";

/**
 * Fixes mobile viewport height issues when keyboard opens/closes
 * by setting a CSS variable with a stable viewport height
 * Only applies on mobile devices (< 768px, matching Tailwind's md breakpoint)
 */
export function ViewportHeightFix() {
    useEffect(() => {
        // Check if we're on mobile (md breakpoint is typically 768px)
        const isMobile = () => window.innerWidth < 768;
        
        // On desktop, don't set --vh at all, let CSS use 100vh directly
        if (!isMobile()) {
            // Remove --vh if it was set, so CSS falls back to 100vh
            document.documentElement.style.removeProperty("--vh");
            return;
        }

        // Mobile-specific logic
        let maxHeight = window.innerHeight;
        let resizeTimer: NodeJS.Timeout;

        // Set the viewport height as a CSS variable
        const setViewportHeight = (height: number) => {
            document.documentElement.style.setProperty("--vh", `${height}px`);
        };

        // Set initial value
        setViewportHeight(maxHeight);

        const handleResize = () => {
            // If we switched to desktop, remove --vh and stop
            if (!isMobile()) {
                document.documentElement.style.removeProperty("--vh");
                return;
            }

            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const currentHeight = window.innerHeight;

                // Track the maximum height we've seen (when keyboard is closed)
                if (currentHeight > maxHeight) {
                    maxHeight = currentHeight;
                    setViewportHeight(maxHeight);
                }
                // If current height is close to max, update max (keyboard closed)
                else if (currentHeight >= maxHeight * 0.9) {
                    maxHeight = currentHeight;
                    setViewportHeight(maxHeight);
                }
                // Otherwise, keep using the max height (keyboard is open)
            }, 100);
        };

        const handleOrientationChange = () => {
            // Reset on orientation change
            setTimeout(() => {
                maxHeight = window.innerHeight;
                setViewportHeight(maxHeight);
            }, 150);
        };

        window.addEventListener("resize", handleResize);
        window.addEventListener("orientationchange", handleOrientationChange);

        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("orientationchange", handleOrientationChange);
            clearTimeout(resizeTimer);
        };
    }, []);

    return null;
}

