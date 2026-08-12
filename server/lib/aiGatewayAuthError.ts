import {
    AI_CAPABILITY_DEFS,
    OPENAI_AUTH_ERROR_BODY,
    type AiCapability
} from "@server/lib/aiCapabilities";
import HttpCode from "@server/types/HttpCode";

export type ClientErrorResponse = {
    statusCode?: number;
    contentType?: string;
    body: string;
};

export function buildInferenceAuthClientError(
    capability: AiCapability | null
): ClientErrorResponse {
    const body =
        capability != null
            ? AI_CAPABILITY_DEFS[capability].authErrorBody
            : OPENAI_AUTH_ERROR_BODY;

    return {
        statusCode: HttpCode.UNAUTHORIZED,
        contentType: "application/json",
        body: JSON.stringify(body)
    };
}
