import { sendToClient } from "#dynamic/routers/ws";
// Error codes for registration failures
export const OlmErrorCodes = {
    OLM_NOT_FOUND: "OLM_NOT_FOUND",
    CLIENT_ID_NOT_FOUND: "CLIENT_ID_NOT_FOUND",
    CLIENT_NOT_FOUND: "CLIENT_NOT_FOUND",
    CLIENT_BLOCKED: "CLIENT_BLOCKED",
    CLIENT_PENDING: "CLIENT_PENDING",
    ORG_NOT_FOUND: "ORG_NOT_FOUND",
    USER_ID_NOT_FOUND: "USER_ID_NOT_FOUND",
    INVALID_USER_SESSION: "INVALID_USER_SESSION",
    USER_ID_MISMATCH: "USER_ID_MISMATCH",
    ACCESS_POLICY_DENIED: "ACCESS_POLICY_DENIED",
    TERMINATED_REKEYED: "TERMINATED_REKEYED",
    TERMINATED_ORG_DELETED: "TERMINATED_ORG_DELETED",
    TERMINATED_INACTIVITY: "TERMINATED_INACTIVITY",
    TERMINATED_DELETED: "TERMINATED_DELETED",
    TERMINATED_ARCHIVED: "TERMINATED_ARCHIVED",
    TERMINATED_BLOCKED: "TERMINATED_BLOCKED"
} as const;

// Helper function to send registration error
export async function sendOlmError(
    code: string,
    errorMessage: string,
    olmId: string
) {
    sendToClient(olmId, {
        type: "olm/error",
        data: {
            code,
            message: errorMessage
        }
    });
}
