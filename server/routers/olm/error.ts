import { sendToClient } from "#dynamic/routers/ws";
// Error codes for registration failures
export const OlmErrorCodes = {
    OLM_NOT_FOUND: {
        code: "OLM_NOT_FOUND",
        message: "The requested OLM session could not be found."
    },
    CLIENT_ID_NOT_FOUND: {
        code: "CLIENT_ID_NOT_FOUND",
        message: "No client ID was provided in the request."
    },
    CLIENT_NOT_FOUND: {
        code: "CLIENT_NOT_FOUND",
        message: "The specified client does not exist."
    },
    CLIENT_BLOCKED: {
        code: "CLIENT_BLOCKED",
        message: "This client has been blocked and cannot connect."
    },
    CLIENT_PENDING: {
        code: "CLIENT_PENDING",
        message: "This client is pending approval and cannot connect yet."
    },
    ORG_NOT_FOUND: {
        code: "ORG_NOT_FOUND",
        message: "The organization could not be found."
    },
    USER_ID_NOT_FOUND: {
        code: "USER_ID_NOT_FOUND",
        message: "No user ID was provided in the request."
    },
    INVALID_USER_SESSION: {
        code: "INVALID_USER_SESSION",
        message: "Your user session is invalid or has expired."
    },
    USER_ID_MISMATCH: {
        code: "USER_ID_MISMATCH",
        message: "The provided user ID does not match the session."
    },
    ACCESS_POLICY_DENIED: {
        code: "ACCESS_POLICY_DENIED",
        message: "Access denied due to policy restrictions."
    },
    TERMINATED_REKEYED: {
        code: "TERMINATED_REKEYED",
        message: "This session was terminated because encryption keys were regenerated."
    },
    TERMINATED_ORG_DELETED: {
        code: "TERMINATED_ORG_DELETED",
        message: "This session was terminated because the organization was deleted."
    },
    TERMINATED_INACTIVITY: {
        code: "TERMINATED_INACTIVITY",
        message: "This session was terminated due to inactivity."
    },
    TERMINATED_DELETED: {
        code: "TERMINATED_DELETED",
        message: "This session was terminated because it was deleted."
    },
    TERMINATED_ARCHIVED: {
        code: "TERMINATED_ARCHIVED",
        message: "This session was terminated because it was archived."
    },
    TERMINATED_BLOCKED: {
        code: "TERMINATED_BLOCKED",
        message: "This session was terminated because access was blocked."
    }
} as const;

// Helper function to send registration error
export async function sendOlmError(
    error: typeof OlmErrorCodes[keyof typeof OlmErrorCodes],
    olmId: string
) {
    sendToClient(olmId, {
        type: "olm/error",
        data: {
            code: error.code,
            message: error.message
        }
    });
}
