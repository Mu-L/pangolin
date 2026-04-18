"use client";

import { KeyRound, ExternalLink } from "lucide-react";
import Link from "next/link";

export function ContactSalesBanner() {
    return (
        <div className="rounded-md border border-black-500/30 bg-linear-to-br from-black-500/10 via-background to-background overflow-hidden">
            <div className="py-3 px-4">
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <KeyRound className="size-4 shrink-0 text-black-500" />
                    <span>
                        Contact sales to enable this feature.{" "}
                        <Link
                            href="https://click.fossorial.io/ep922"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-black-600 underline"
                        >
                            Book a demo
                            <ExternalLink className="size-3.5 shrink-0" />
                        </Link>
                        {" or "}
                        <Link
                            href="https://pangolin.net/contact"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-black-600 underline"
                        >
                            contact us
                            <ExternalLink className="size-3.5 shrink-0" />
                        </Link>
                        .
                    </span>
                </div>
            </div>
        </div>
    );
}
