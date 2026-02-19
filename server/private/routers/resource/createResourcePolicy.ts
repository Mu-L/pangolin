import { Request, Response, NextFunction } from "express";
import z from "zod";

const createResourcePolicyParamsSchema = z.strictObject({
    orgId: z.string()
});

export async function createResourcePolicy(
    req: Request,
    res: Response,
    next: NextFunction
) {}
