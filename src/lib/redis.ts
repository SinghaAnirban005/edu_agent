import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  client.on("error", (err) => {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Redis] Connection error (non-fatal):", err.message);
    }
  });

  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export const SESSION_TTL = 60 * 60 * 2;

export async function setSessionData<T>(
  sessionId: string,
  key: string,
  value: T
): Promise<void> {
  try {
    await redis.setex(
      `session:${sessionId}:${key}`,
      SESSION_TTL,
      JSON.stringify(value)
    );
  } catch {
    // Redis unavailable — fall through to DB
  }
}

export async function getSessionData<T>(
  sessionId: string,
  key: string
): Promise<T | null> {
  try {
    const raw = await redis.get(`session:${sessionId}:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function deleteSessionData(
  sessionId: string,
  key: string
): Promise<void> {
  try {
    await redis.del(`session:${sessionId}:${key}`);
  } catch {
  }
}
