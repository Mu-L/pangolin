import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const registry = new OpenAPIRegistry();

export enum OpenAPITags {
    Site = "Site",
    Org = "Organization",
    PublicResource = "Public Resource",
    PublicResourceLegacy = "Public Resource (Legacy)",
    PrivateResource = "Private Resource",
    PrivateResourceLegacy = "Private Resource (Legacy)",
    Policy = "Policy",
    Role = "Role",
    User = "User",
    Invitation = "User Invitation",
    Target = "Resource Target",
    Rule = "Rule",
    AccessToken = "Access Token",
    GlobalIdp = "Identity Provider (Global)",
    OrgIdp = "Identity Provider (Organization Only)",
    Client = "Client",
    ApiKey = "API Key",
    SiteProvisioningKey = "Site Provisioning Key",
    Domain = "Domain",
    Blueprint = "Blueprint",
    Ssh = "SSH",
    Logs = "Logs"
}
