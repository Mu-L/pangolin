import NodeCache from "node-cache";
import logger from "@server/logger";
import { redisManager } from "@server/private/lib/redis";

// Create local cache with maxKeys limit to prevent memory leaks
// With ~10k requests/day and 5min TTL, 10k keys should be more than sufficient
export const localCache = new NodeCache({
    stdTTL: 3600,
    checkperiod: 120,
    maxKeys: 10000
});

// Log cache statistics periodically for monitoring
setInterval(() => {
    const stats = localCache.getStats();
    logger.debug(
        `Local cache stats - Keys: ${stats.keys}, Hits: ${stats.hits}, Misses: ${stats.misses}, Hit rate: ${stats.hits > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) : 0}%`
    );
}, 300000); // Every 5 minutes

/**
 * Adaptive cache that uses Redis when available in multi-node environments,
 * otherwise falls back to local memory cache for single-node deployments.
 */
class AdaptiveCache {
    private useRedis(): boolean {
        return redisManager.isRedisEnabled() && redisManager.getHealthStatus().isHealthy;
    }

    /**
     * Set a value in the cache
     * @param key - Cache key
     * @param value - Value to cache (will be JSON stringified for Redis)
     * @param ttl - Time to live in seconds (0 = no expiration)
     * @returns boolean indicating success
     */
    async set(key: string, value: any, ttl?: number): Promise<boolean> {
        const effectiveTtl = ttl === 0 ? undefined : ttl;

        if (this.useRedis()) {
            try {
                const serialized = JSON.stringify(value);
                const success = await redisManager.set(key, serialized, effectiveTtl);

                if (success) {
                    logger.debug(`Set key in Redis: ${key}`);
                    return true;
                }

                // Redis failed, fall through to local cache
                logger.debug(`Redis set failed for key ${key}, falling back to local cache`);
            } catch (error) {
                logger.error(`Redis set error for key ${key}:`, error);
                // Fall through to local cache
            }
        }

        // Use local cache as fallback or primary
        const success = localCache.set(key, value, effectiveTtl || 0);
        if (success) {
            logger.debug(`Set key in local cache: ${key}`);
        }
        return success;
    }

    /**
     * Get a value from the cache
     * @param key - Cache key
     * @returns The cached value or undefined if not found
     */
    async get<T = any>(key: string): Promise<T | undefined> {
        if (this.useRedis()) {
            try {
                const value = await redisManager.get(key);

                if (value !== null) {
                    logger.debug(`Cache hit in Redis: ${key}`);
                    return JSON.parse(value) as T;
                }

                logger.debug(`Cache miss in Redis: ${key}`);
                return undefined;
            } catch (error) {
                logger.error(`Redis get error for key ${key}:`, error);
                // Fall through to local cache
            }
        }

        // Use local cache as fallback or primary
        const value = localCache.get<T>(key);
        if (value !== undefined) {
            logger.debug(`Cache hit in local cache: ${key}`);
        } else {
            logger.debug(`Cache miss in local cache: ${key}`);
        }
        return value;
    }

    /**
     * Delete a value from the cache
     * @param key - Cache key or array of keys
     * @returns Number of deleted entries
     */
    async del(key: string | string[]): Promise<number> {
        const keys = Array.isArray(key) ? key : [key];
        let deletedCount = 0;

        if (this.useRedis()) {
            try {
                for (const k of keys) {
                    const success = await redisManager.del(k);
                    if (success) {
                        deletedCount++;
                        logger.debug(`Deleted key from Redis: ${k}`);
                    }
                }

                if (deletedCount === keys.length) {
                    return deletedCount;
                }

                // Some Redis deletes failed, fall through to local cache
                logger.debug(`Some Redis deletes failed, falling back to local cache`);
            } catch (error) {
                logger.error(`Redis del error for keys ${keys.join(", ")}:`, error);
                // Fall through to local cache
                deletedCount = 0;
            }
        }

        // Use local cache as fallback or primary
        for (const k of keys) {
            const success = localCache.del(k);
            if (success > 0) {
                deletedCount++;
                logger.debug(`Deleted key from local cache: ${k}`);
            }
        }

        return deletedCount;
    }

    /**
     * Check if a key exists in the cache
     * @param key - Cache key
     * @returns boolean indicating if key exists
     */
    async has(key: string): Promise<boolean> {
        if (this.useRedis()) {
            try {
                const value = await redisManager.get(key);
                return value !== null;
            } catch (error) {
                logger.error(`Redis has error for key ${key}:`, error);
                // Fall through to local cache
            }
        }

        // Use local cache as fallback or primary
        return localCache.has(key);
    }

    /**
     * Get multiple values from the cache
     * @param keys - Array of cache keys
     * @returns Array of values (undefined for missing keys)
     */
    async mget<T = any>(keys: string[]): Promise<(T | undefined)[]> {
        if (this.useRedis()) {
            try {
                const results: (T | undefined)[] = [];

                for (const key of keys) {
                    const value = await redisManager.get(key);
                    if (value !== null) {
                        results.push(JSON.parse(value) as T);
                    } else {
                        results.push(undefined);
                    }
                }

                return results;
            } catch (error) {
                logger.error(`Redis mget error:`, error);
                // Fall through to local cache
            }
        }

        // Use local cache as fallback or primary
        return keys.map((key) => localCache.get<T>(key));
    }

    /**
     * Flush all keys from the cache
     */
    async flushAll(): Promise<void> {
        if (this.useRedis()) {
            logger.warn("Adaptive cache flushAll called - Redis flush not implemented, only local cache will be flushed");
        }

        localCache.flushAll();
        logger.debug("Flushed local cache");
    }

    /**
     * Get cache statistics
     * Note: Only returns local cache stats, Redis stats are not included
     */
    getStats() {
        return localCache.getStats();
    }

    /**
     * Get the current cache backend being used
     * @returns "redis" if Redis is available and healthy, "local" otherwise
     */
    getCurrentBackend(): "redis" | "local" {
        return this.useRedis() ? "redis" : "local";
    }

    /**
     * Take a key from the cache and delete it
     * @param key - Cache key
     * @returns The value or undefined if not found
     */
    async take<T = any>(key: string): Promise<T | undefined> {
        const value = await this.get<T>(key);
        if (value !== undefined) {
            await this.del(key);
        }
        return value;
    }

    /**
     * Get TTL (time to live) for a key
     * @param key - Cache key
     * @returns TTL in seconds, 0 if no expiration, -1 if key doesn't exist
     */
    getTtl(key: string): number {
        // Note: This only works for local cache, Redis TTL is not supported
        if (this.useRedis()) {
            logger.warn(`getTtl called for key ${key} but Redis TTL lookup is not implemented`);
        }

        const ttl = localCache.getTtl(key);
        if (ttl === undefined) {
            return -1;
        }
        return Math.max(0, Math.floor((ttl - Date.now()) / 1000));
    }

    /**
     * Get all keys from the cache
     * Note: Only returns local cache keys, Redis keys are not included
     */
    keys(): string[] {
        if (this.useRedis()) {
            logger.warn("keys() called but Redis keys are not included, only local cache keys returned");
        }
        return localCache.keys();
    }
}

// Export singleton instance
export const cache = new AdaptiveCache();
export default cache;
