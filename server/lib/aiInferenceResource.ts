import { and, eq, inArray } from "drizzle-orm";
import {
    aiModels,
    aiProviders,
    db,
    resourceAiModels,
    resourceAiProviders,
    siteResourceAiModels,
    siteResourceAiProviders,
    type Transaction
} from "@server/db";
import { z } from "zod";

type DbOrTrx = Transaction | typeof db;

export const modelAccessModeSchema = z.enum(["catalog", "allowlist"]);

export type ModelAccessMode = z.infer<typeof modelAccessModeSchema>;

export const resourceAiProviderAttachmentSchema = z.strictObject({
    providerId: z.number().int().positive(),
    modelAccessMode: modelAccessModeSchema.optional()
});

export type ResourceAiProviderInput = z.infer<
    typeof resourceAiProviderAttachmentSchema
>;

export type ResourceAiProviderAttachment = {
    providerId: number;
    modelAccessMode: ModelAccessMode;
};

export type InferenceFieldsError = {
    error: string;
};

export function isInferenceFieldsError(
    value: { error: string } | object
): value is InferenceFieldsError {
    return "error" in value;
}

function normalizeAttachments(
    inputs: ResourceAiProviderInput[]
): ResourceAiProviderAttachment[] {
    const byProvider = new Map<number, ModelAccessMode>();
    for (const input of inputs) {
        byProvider.set(input.providerId, input.modelAccessMode ?? "catalog");
    }
    return [...byProvider.entries()].map(([providerId, modelAccessMode]) => ({
        providerId,
        modelAccessMode
    }));
}

/**
 * Ensure enabled catalog modelKeys are unique across attached providers.
 * Catalog attachments contribute all enabled models on the provider.
 * Allowlist attachments contribute nothing until models are allowlisted
 * (those are checked when the allowlist is set).
 */
export async function assertNoOverlappingModelKeys(
    attachments: ResourceAiProviderAttachment[],
    trx: DbOrTrx = db
): Promise<InferenceFieldsError | null> {
    const catalogProviderIds = attachments
        .filter((a) => a.modelAccessMode === "catalog")
        .map((a) => a.providerId);

    if (catalogProviderIds.length < 2) {
        return null;
    }

    const models = await trx
        .select({
            providerId: aiModels.providerId,
            modelKey: aiModels.modelKey
        })
        .from(aiModels)
        .where(
            and(
                inArray(aiModels.providerId, catalogProviderIds),
                eq(aiModels.enabled, true)
            )
        );

    const keyToProviders = new Map<string, number[]>();
    for (const model of models) {
        const existing = keyToProviders.get(model.modelKey) ?? [];
        if (!existing.includes(model.providerId)) {
            existing.push(model.providerId);
        }
        keyToProviders.set(model.modelKey, existing);
    }

    const overlaps = [...keyToProviders.entries()].filter(
        ([, providerIds]) => providerIds.length > 1
    );
    if (overlaps.length === 0) {
        return null;
    }

    const keys = overlaps.map(([key]) => key).sort();
    return {
        error: `Model keys must be unique across providers on a resource. Overlapping keys: ${keys.join(", ")}`
    };
}

/**
 * Validate provider attachments for an org.
 */
export async function resolveProviderAttachments(input: {
    orgId: string;
    attachments: ResourceAiProviderInput[];
    requireAtLeastOne: boolean;
}): Promise<ResourceAiProviderAttachment[] | InferenceFieldsError> {
    const attachments = normalizeAttachments(input.attachments);

    if (input.requireAtLeastOne && attachments.length === 0) {
        return {
            error: "At least one AI provider is required for inference-mode resources"
        };
    }

    if (attachments.length === 0) {
        return [];
    }

    const providerIds = attachments.map((a) => a.providerId);
    const providers = await db
        .select({
            providerId: aiProviders.providerId,
            orgId: aiProviders.orgId,
            enabled: aiProviders.enabled
        })
        .from(aiProviders)
        .where(
            and(
                inArray(aiProviders.providerId, providerIds),
                eq(aiProviders.orgId, input.orgId)
            )
        );

    if (providers.length !== providerIds.length) {
        return {
            error: "One or more AI providers were not found in this organization"
        };
    }

    const disabled = providers.find((p) => !p.enabled);
    if (disabled) {
        return {
            error: `AI provider with ID ${disabled.providerId} is disabled`
        };
    }

    const overlapError = await assertNoOverlappingModelKeys(attachments);
    if (overlapError) {
        return overlapError;
    }

    return attachments;
}

export async function assertInferenceModeAllowsProviderFields(input: {
    mode: string;
    hasProviderAttachments: boolean;
}): Promise<InferenceFieldsError | null> {
    if (input.mode === "inference") {
        return null;
    }
    if (input.hasProviderAttachments) {
        return {
            error: "AI providers can only be attached to inference-mode resources"
        };
    }
    return null;
}

export async function setPublicResourceAiProviders(
    resourceId: number,
    attachments: ResourceAiProviderAttachment[],
    trx: DbOrTrx = db
): Promise<void> {
    await trx
        .delete(resourceAiProviders)
        .where(eq(resourceAiProviders.resourceId, resourceId));

    if (attachments.length > 0) {
        await trx.insert(resourceAiProviders).values(
            attachments.map((a) => ({
                resourceId,
                providerId: a.providerId,
                modelAccessMode: a.modelAccessMode
            }))
        );
    }

    await prunePublicResourceAllowlistToAllowlistProviders(resourceId, trx);
}

export async function setSiteResourceAiProviders(
    siteResourceId: number,
    attachments: ResourceAiProviderAttachment[],
    trx: DbOrTrx = db
): Promise<void> {
    await trx
        .delete(siteResourceAiProviders)
        .where(eq(siteResourceAiProviders.siteResourceId, siteResourceId));

    if (attachments.length > 0) {
        await trx.insert(siteResourceAiProviders).values(
            attachments.map((a) => ({
                siteResourceId,
                providerId: a.providerId,
                modelAccessMode: a.modelAccessMode
            }))
        );
    }

    await pruneSiteResourceAllowlistToAllowlistProviders(siteResourceId, trx);
}

export async function clearPublicResourceAiConfig(
    resourceId: number,
    trx: DbOrTrx = db
): Promise<void> {
    await trx
        .delete(resourceAiModels)
        .where(eq(resourceAiModels.resourceId, resourceId));
    await trx
        .delete(resourceAiProviders)
        .where(eq(resourceAiProviders.resourceId, resourceId));
}

export async function clearSiteResourceAiConfig(
    siteResourceId: number,
    trx: DbOrTrx = db
): Promise<void> {
    await trx
        .delete(siteResourceAiModels)
        .where(eq(siteResourceAiModels.siteResourceId, siteResourceId));
    await trx
        .delete(siteResourceAiProviders)
        .where(eq(siteResourceAiProviders.siteResourceId, siteResourceId));
}

async function prunePublicResourceAllowlistToAllowlistProviders(
    resourceId: number,
    trx: DbOrTrx = db
): Promise<void> {
    const allowlistProviders = await trx
        .select({ providerId: resourceAiProviders.providerId })
        .from(resourceAiProviders)
        .where(
            and(
                eq(resourceAiProviders.resourceId, resourceId),
                eq(resourceAiProviders.modelAccessMode, "allowlist")
            )
        );

    if (allowlistProviders.length === 0) {
        await trx
            .delete(resourceAiModels)
            .where(eq(resourceAiModels.resourceId, resourceId));
        return;
    }

    const validModels = await trx
        .select({ modelId: aiModels.modelId })
        .from(aiModels)
        .where(
            inArray(
                aiModels.providerId,
                allowlistProviders.map((p) => p.providerId)
            )
        );
    const validIds = validModels.map((m) => m.modelId);

    const existing = await trx
        .select({ modelId: resourceAiModels.modelId })
        .from(resourceAiModels)
        .where(eq(resourceAiModels.resourceId, resourceId));

    const toRemove = existing
        .map((e) => e.modelId)
        .filter((id) => !validIds.includes(id));

    if (toRemove.length > 0) {
        await trx
            .delete(resourceAiModels)
            .where(
                and(
                    eq(resourceAiModels.resourceId, resourceId),
                    inArray(resourceAiModels.modelId, toRemove)
                )
            );
    }
}

async function pruneSiteResourceAllowlistToAllowlistProviders(
    siteResourceId: number,
    trx: DbOrTrx = db
): Promise<void> {
    const allowlistProviders = await trx
        .select({ providerId: siteResourceAiProviders.providerId })
        .from(siteResourceAiProviders)
        .where(
            and(
                eq(siteResourceAiProviders.siteResourceId, siteResourceId),
                eq(siteResourceAiProviders.modelAccessMode, "allowlist")
            )
        );

    if (allowlistProviders.length === 0) {
        await trx
            .delete(siteResourceAiModels)
            .where(eq(siteResourceAiModels.siteResourceId, siteResourceId));
        return;
    }

    const validModels = await trx
        .select({ modelId: aiModels.modelId })
        .from(aiModels)
        .where(
            inArray(
                aiModels.providerId,
                allowlistProviders.map((p) => p.providerId)
            )
        );
    const validIds = validModels.map((m) => m.modelId);

    const existing = await trx
        .select({ modelId: siteResourceAiModels.modelId })
        .from(siteResourceAiModels)
        .where(eq(siteResourceAiModels.siteResourceId, siteResourceId));

    const toRemove = existing
        .map((e) => e.modelId)
        .filter((id) => !validIds.includes(id));

    if (toRemove.length > 0) {
        await trx
            .delete(siteResourceAiModels)
            .where(
                and(
                    eq(siteResourceAiModels.siteResourceId, siteResourceId),
                    inArray(siteResourceAiModels.modelId, toRemove)
                )
            );
    }
}

export async function listPublicResourceAiProviders(resourceId: number) {
    return db
        .select({
            providerId: resourceAiProviders.providerId,
            modelAccessMode: resourceAiProviders.modelAccessMode,
            name: aiProviders.name,
            type: aiProviders.type,
            enabled: aiProviders.enabled
        })
        .from(resourceAiProviders)
        .innerJoin(
            aiProviders,
            eq(resourceAiProviders.providerId, aiProviders.providerId)
        )
        .where(eq(resourceAiProviders.resourceId, resourceId));
}

export async function listSiteResourceAiProviders(siteResourceId: number) {
    return db
        .select({
            providerId: siteResourceAiProviders.providerId,
            modelAccessMode: siteResourceAiProviders.modelAccessMode,
            name: aiProviders.name,
            type: aiProviders.type,
            enabled: aiProviders.enabled
        })
        .from(siteResourceAiProviders)
        .innerJoin(
            aiProviders,
            eq(siteResourceAiProviders.providerId, aiProviders.providerId)
        )
        .where(eq(siteResourceAiProviders.siteResourceId, siteResourceId));
}

/**
 * Allowlist APIs require an inference resource with at least one
 * attached provider in allowlist mode.
 */
export async function assertPublicAllowlistApiEligible(resource: {
    resourceId: number;
    mode: string;
}): Promise<string | null> {
    if (resource.mode !== "inference") {
        return "AI model allowlists are only supported on inference-mode resources";
    }

    const [row] = await db
        .select({ providerId: resourceAiProviders.providerId })
        .from(resourceAiProviders)
        .where(
            and(
                eq(resourceAiProviders.resourceId, resource.resourceId),
                eq(resourceAiProviders.modelAccessMode, "allowlist")
            )
        )
        .limit(1);

    if (!row) {
        return "Attach at least one AI provider with modelAccessMode=allowlist before managing allowed models";
    }
    return null;
}

export async function assertSiteAllowlistApiEligible(siteResource: {
    siteResourceId: number;
    mode: string;
}): Promise<string | null> {
    if (siteResource.mode !== "inference") {
        return "AI model allowlists are only supported on inference-mode resources";
    }

    const [row] = await db
        .select({ providerId: siteResourceAiProviders.providerId })
        .from(siteResourceAiProviders)
        .where(
            and(
                eq(
                    siteResourceAiProviders.siteResourceId,
                    siteResource.siteResourceId
                ),
                eq(siteResourceAiProviders.modelAccessMode, "allowlist")
            )
        )
        .limit(1);

    if (!row) {
        return "Attach at least one AI provider with modelAccessMode=allowlist before managing allowed models";
    }
    return null;
}

/**
 * Models must belong to providers attached to this resource in allowlist mode,
 * and those providers must belong to the resource's org.
 */
export async function assertModelsBelongToPublicAllowlistProviders(input: {
    orgId: string;
    resourceId: number;
    modelIds: number[];
}): Promise<string | null> {
    const uniqueIds = [...new Set(input.modelIds)];
    if (uniqueIds.length === 0) {
        return null;
    }

    const allowlistProviders = await db
        .select({ providerId: resourceAiProviders.providerId })
        .from(resourceAiProviders)
        .innerJoin(
            aiProviders,
            eq(resourceAiProviders.providerId, aiProviders.providerId)
        )
        .where(
            and(
                eq(resourceAiProviders.resourceId, input.resourceId),
                eq(resourceAiProviders.modelAccessMode, "allowlist"),
                eq(aiProviders.orgId, input.orgId)
            )
        );

    if (allowlistProviders.length === 0) {
        return "No allowlist AI providers are attached to this resource";
    }

    const validModels = await db
        .select({ modelId: aiModels.modelId })
        .from(aiModels)
        .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.providerId))
        .where(
            and(
                inArray(aiModels.modelId, uniqueIds),
                inArray(
                    aiModels.providerId,
                    allowlistProviders.map((p) => p.providerId)
                ),
                eq(aiProviders.orgId, input.orgId)
            )
        );

    if (validModels.length !== uniqueIds.length) {
        return "One or more model IDs do not exist or do not belong to an allowlist provider on this resource";
    }

    return null;
}

export async function assertModelsBelongToSiteAllowlistProviders(input: {
    orgId: string;
    siteResourceId: number;
    modelIds: number[];
}): Promise<string | null> {
    const uniqueIds = [...new Set(input.modelIds)];
    if (uniqueIds.length === 0) {
        return null;
    }

    const allowlistProviders = await db
        .select({ providerId: siteResourceAiProviders.providerId })
        .from(siteResourceAiProviders)
        .innerJoin(
            aiProviders,
            eq(siteResourceAiProviders.providerId, aiProviders.providerId)
        )
        .where(
            and(
                eq(
                    siteResourceAiProviders.siteResourceId,
                    input.siteResourceId
                ),
                eq(siteResourceAiProviders.modelAccessMode, "allowlist"),
                eq(aiProviders.orgId, input.orgId)
            )
        );

    if (allowlistProviders.length === 0) {
        return "No allowlist AI providers are attached to this site resource";
    }

    const validModels = await db
        .select({ modelId: aiModels.modelId })
        .from(aiModels)
        .innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.providerId))
        .where(
            and(
                inArray(aiModels.modelId, uniqueIds),
                inArray(
                    aiModels.providerId,
                    allowlistProviders.map((p) => p.providerId)
                ),
                eq(aiProviders.orgId, input.orgId)
            )
        );

    if (validModels.length !== uniqueIds.length) {
        return "One or more model IDs do not exist or do not belong to an allowlist provider on this site resource";
    }

    return null;
}
