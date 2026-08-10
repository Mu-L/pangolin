import { z } from "zod";

export const virtualApiKeyResourceIdsSchema = z
    .array(z.coerce.number().int().positive())
    .optional();

export const createVirtualApiKeyBodySchema = z.strictObject({
    name: z.string().nonempty(),
    description: z.string().optional().nullable(),
    userId: z.string().optional().nullable(),
    allResources: z.boolean().optional().default(false),
    resourceIds: virtualApiKeyResourceIdsSchema,
    validForSeconds: z.int().positive().optional()
});

export const updateVirtualApiKeyBodySchema = z.strictObject({
    name: z.string().nonempty().optional(),
    description: z.string().optional().nullable(),
    userId: z.string().optional().nullable(),
    allResources: z.boolean().optional(),
    resourceIds: virtualApiKeyResourceIdsSchema,
    validForSeconds: z.int().positive().optional().nullable()
});
