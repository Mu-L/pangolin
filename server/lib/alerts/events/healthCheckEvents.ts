// stub

export async function fireHealthCheckHealthyAlert(
    orgId: string,
    healthCheckId: number,
    healthCheckName?: string,
    healthCheckTargetId?: number | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
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
    send: boolean = true,
    trx?: unknown
): Promise<void> {
    return;
}

export async function fireHealthCheckUnknownAlert(
    orgId: string,
    healthCheckId: number,
    healthCheckName?: string | null,
    healthCheckTargetId?: number | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
    trx?: unknown
): Promise<void> {
    return;
}
