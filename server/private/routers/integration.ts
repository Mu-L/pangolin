/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import * as orgIdp from "#private/routers/orgIdp";
import * as org from "#private/routers/org";
import * as logs from "#private/routers/auditLogs";

import {
    verifyApiKeyHasAction,
    verifyApiKeyIsRoot,
    verifyApiKeyOrgAccess,
    verifyApiKeyIdpAccess,
    verifyLimits
} from "@server/middlewares";
import {
    verifyValidSubscription,
    verifyValidLicense
} from "#private/middlewares";
import { ActionsEnum } from "@server/auth/actions";
import {
    unauthenticated as ua,
    authenticated as a
} from "@server/routers/integration";
import { logActionAudit } from "#private/middlewares";
import { tierMatrix } from "@server/lib/billing/tierMatrix";

export const unauthenticated = ua;
export const authenticated = a;

authenticated.post(
    `/org/:orgId/send-usage-notification`,
    verifyApiKeyIsRoot, // We are the only ones who can use root key so its fine
    verifyApiKeyHasAction(ActionsEnum.sendUsageNotification),
    logActionAudit(ActionsEnum.sendUsageNotification),
    org.sendUsageNotification
);

authenticated.delete(
    "/idp/:idpId",
    verifyApiKeyIsRoot,
    verifyApiKeyHasAction(ActionsEnum.deleteIdp),
    logActionAudit(ActionsEnum.deleteIdp),
    orgIdp.deleteOrgIdp
);

authenticated.get(
    "/org/:orgId/logs/action",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.actionLogs),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logs.queryActionAuditLogs
);

authenticated.get(
    "/org/:orgId/logs/action/export",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.logExport),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logActionAudit(ActionsEnum.exportLogs),
    logs.exportActionAuditLogs
);

authenticated.get(
    "/org/:orgId/logs/access",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.accessLogs),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logs.queryAccessAuditLogs
);

authenticated.get(
    "/org/:orgId/logs/access/export",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.logExport),
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.exportLogs),
    logActionAudit(ActionsEnum.exportLogs),
    logs.exportAccessAuditLogs
);

authenticated.put(
    "/org/:orgId/idp/oidc",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.orgOidc),
    verifyApiKeyOrgAccess,
    verifyLimits,
    verifyApiKeyHasAction(ActionsEnum.createIdp),
    logActionAudit(ActionsEnum.createIdp),
    orgIdp.createOrgOidcIdp
);

authenticated.post(
    "/org/:orgId/idp/:idpId/oidc",
    verifyValidLicense,
    verifyValidSubscription(tierMatrix.orgOidc),
    verifyApiKeyOrgAccess,
    verifyApiKeyIdpAccess,
    verifyLimits,
    verifyApiKeyHasAction(ActionsEnum.updateIdp),
    logActionAudit(ActionsEnum.updateIdp),
    orgIdp.updateOrgOidcIdp
);

authenticated.delete(
    "/org/:orgId/idp/:idpId",
    verifyValidLicense,
    verifyApiKeyOrgAccess,
    verifyApiKeyIdpAccess,
    verifyApiKeyHasAction(ActionsEnum.deleteIdp),
    logActionAudit(ActionsEnum.deleteIdp),
    orgIdp.deleteOrgIdp
);

authenticated.get(
    "/org/:orgId/idp/:idpId",
    verifyValidLicense,
    verifyApiKeyOrgAccess,
    verifyApiKeyIdpAccess,
    verifyApiKeyHasAction(ActionsEnum.getIdp),
    orgIdp.getOrgIdp
);

authenticated.get(
    "/org/:orgId/idp",
    verifyValidLicense,
    verifyApiKeyOrgAccess,
    verifyApiKeyHasAction(ActionsEnum.listIdps),
    orgIdp.listOrgIdps
);
