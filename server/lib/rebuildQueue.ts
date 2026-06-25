export type RebuildJobType = "site-resource" | "client";

export interface RebuildJob {
    type: RebuildJobType;
    id: number;
}

export interface RebuildJobHandlers {
    onSiteResource(siteResourceId: number): Promise<void>;
    onClient(clientId: number): Promise<void>;
}

export interface RebuildQueueManager {
    enqueue(job: RebuildJob): Promise<void>;
    startProcessing(handlers: RebuildJobHandlers): void;
    isQueued(job: RebuildJob): Promise<boolean>;
}

class NoopRebuildQueue implements RebuildQueueManager {
    async enqueue(_job: RebuildJob): Promise<void> {}
    startProcessing(_handlers: RebuildJobHandlers): void {}
    async isQueued(_job: RebuildJob): Promise<boolean> {
        return false;
    }
}

export const rebuildQueue: RebuildQueueManager = new NoopRebuildQueue();
