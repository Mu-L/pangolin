export enum TierFeature {
    OrgOidc = "orgOidc",
    CustomAuthenticationDomain = "customAuthenticationDomain",
    DeviceApprovals = "deviceApprovals",
    LoginPageBranding = "loginPageBranding",
    LogExport = "logExport",
    AccessLogs = "accessLogs",
    ActionLogs = "actionLogs",
    RotateCredentials = "rotateCredentials",
    MaintencePage = "maintencePage",
    DevicePosture = "devicePosture",
    TwoFactorEnforcement = "twoFactorEnforcement",
    SessionDurationPolicies = "sessionDurationPolicies",
    PasswordExpirationPolicies = "passwordExpirationPolicies"
}

export const tierMatrix: Record<TierFeature, string[]> = {
    [TierFeature.OrgOidc]: ["tier1", "tier2", "tier3", "enterprise"],
    [TierFeature.CustomAuthenticationDomain]: [
        "tier1",
        "tier2",
        "tier3",
        "enterprise"
    ],
    [TierFeature.DeviceApprovals]: ["tier1", "tier3", "enterprise"],
    [TierFeature.LoginPageBranding]: ["tier1", "tier3", "enterprise"],
    [TierFeature.LogExport]: ["tier3", "enterprise"],
    [TierFeature.AccessLogs]: ["tier2", "tier3", "enterprise"],
    [TierFeature.ActionLogs]: ["tier2", "tier3", "enterprise"],
    [TierFeature.RotateCredentials]: ["tier1", "tier2", "tier3", "enterprise"],
    [TierFeature.MaintencePage]: ["tier1", "tier2", "tier3", "enterprise"],
    [TierFeature.DevicePosture]: ["tier2", "tier3", "enterprise"],
    [TierFeature.TwoFactorEnforcement]: ["tier1", "tier2", "tier3", "enterprise"],
    [TierFeature.SessionDurationPolicies]: ["tier1", "tier2", "tier3", "enterprise"],
    [TierFeature.PasswordExpirationPolicies]: ["tier1", "tier2", "tier3", "enterprise"]
};
