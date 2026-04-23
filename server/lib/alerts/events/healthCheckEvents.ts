// stub

export async function fireHealthCheckHealthyAlert(
    orgId: string,
    healthCheckId: number,
    healthCheckName?: string,
    healthCheckTargetId?: number | null,
    extra?: Record<string, unknown>,
    trx?: unknown
): Promise<void> {
    return;
}

export async function fireHealthCheckUnhealthyAlert(
    orgId: string,
    healthCheckId: number,
    healthCheckName?: string,
    healthCheckTargetId?: number | null,
    extra?: Record<string, unknown>,
    trx?: unknown
): Promise<void> {
    return;
}