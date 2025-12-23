"use client";

import OrgContext from "@app/contexts/orgContext";
import { GetOrgResponse } from "@server/routers/org";
import { useState } from "react";
import { useTranslations } from "next-intl";

interface OrgProviderProps {
    children: React.ReactNode;
    org: GetOrgResponse | null;
}

export function OrgProvider({ children, org: serverOrg }: OrgProviderProps) {
    const t = useTranslations();

    if (!serverOrg) {
        throw new Error(t("orgErrorNoProvided"));
    }

    const [org, setOrg] = useState<GetOrgResponse>(serverOrg);

    const updateOrg = (updatedOrg: Partial<GetOrgResponse["org"]>) => {
        if (!org) {
            throw new Error(t("orgErrorNoUpdate"));
        }
        setOrg((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                org: {
                    ...prev.org,
                    ...updatedOrg
                }
            };
        });
    };

    return (
        <OrgContext.Provider value={{ org, updateOrg }}>
            {children}
        </OrgContext.Provider>
    );
}

export default OrgProvider;
