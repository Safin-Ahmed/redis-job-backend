const redis = require("../redisClient");

exports.getWorkerHealth = async (req, res) => {
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
    console.error("Error fetching worker health: ", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch worker health" });
  }
};
