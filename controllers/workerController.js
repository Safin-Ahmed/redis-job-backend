const redis = require("../redisClient");
const { trace } = require("@opentelemetry/api");

exports.getWorkerHealth = async (req, res) => {
  const span = trace
    .getTracer("redis-job-service")
    .startSpan("get_workers_health");
  try {
    const workerKeys = await redis.keys("worker:*");
    const workers = [];

    for (const key of workerKeys) {
      const worker = await redis.hgetall(key);
      if (worker) {
        const isAlive = Date.now() - worker.last_seen < 10000;
        workers.push({
          worker_id: key,
          queue: worker.queue,
          status: isAlive ? "ALIVE" : "DEAD",
          last_seen: new Date(parseInt(worker.last_seen, 10)).toISOString(),
        });
      }
    }

    res.status(200).json({ success: true, workers });
  } catch (error) {
    span.recordException(error);
    console.error("Error fetching worker health: ", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch worker health" });
  } finally {
    span.end();
  }
};
