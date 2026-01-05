import { GetOrgResponse } from "@server/routers/org";
import { createContext } from "react";

export interface OrgContextType {
    org: GetOrgResponse;
    updateOrg: (updatedOrg: Partial<GetOrgResponse["org"]>) => void;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export default OrgContext;
