export async function fireResourceHealthyAlert(
    orgId: string,
    resourceId: number,
    resourceName?: string | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
    trx?: unknown
): Promise<void> {}

export async function fireResourceUnhealthyAlert(
    orgId: string,
    resourceId: number,
    resourceName?: string | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
    trx?: unknown
): Promise<void> {}

export async function fireResourceToggleAlert(
    orgId: string,
    resourceId: number,
    resourceName?: string | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
    trx?: unknown
): Promise<void> {}
