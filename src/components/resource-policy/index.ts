// ─── Schemas & types ──────────────────────────────────────────────────────────

import z from "zod";

export const createPolicySchema = z.object({
    name: z.string().min(1).max(255),
    sso: z.boolean().default(true),
    skipToIdpId: z.number().nullable().optional(),
    emailWhitelistEnabled: z.boolean().default(false),
    roles: z.array(z.object({ id: z.string(), text: z.string() })),
    users: z.array(z.object({ id: z.string(), text: z.string() })),
    emails: z.array(z.object({ id: z.string(), text: z.string() })),
    password: z
        .object({
            password: z.string().min(4).max(100)
        })
        .nullable()
        .default(null),
    pincode: z
        .object({
            pincode: z.string().regex(/^\d{6}$/)
        })
        .nullable()
        .default(null),
    headerAuth: z
        .object({
            user: z.string().min(4).max(100),
            password: z.string().min(4).max(100),
            extendedCompatibility: z.boolean().default(true)
        })
        .nullable()
        .default(null),
    applyRules: z.boolean().default(false),
    rules: z
        .array(
            z.object({
                action: z.enum(["ACCEPT", "DROP", "PASS"]),
                match: z.string(),
                value: z.string(),
                priority: z.number().int(),
                enabled: z.boolean()
            })
        )
        .default([])
});

export type PolicyFormValues = z.infer<typeof createPolicySchema>;
