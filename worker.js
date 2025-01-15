const redis = require("./redisClient");
const { v4: uuidv4 } = require("uuid");

const workerId = `worker:${uuidv4()}`;
const queueName = process.argv[2] || "normal_jobs";

// FUNCTION TO UPDATE JOB PROGRESS
async function updateJobProgress(jobId, progress) {
  try {
    console.log({ jobId, progress });
    await redis.hset(jobId, "progress", progress.toString());
    console.log(`Job ${jobId} progress updated to ${progress}%`);
  } catch (error) {
    console.error(`Error updating job progress: ${error}`);
  }
}

async function isJobCancelled(jobId) {
  const jobDetails = await redis.hgetall(jobId);
  return jobDetails.status === "CANCELLED";
}

// FUNCTION TO PROCESS A SINGLE JOB
async function processJob(queueName) {
  const jobId = await redis.brpop(queueName, 0);
  if (jobId) {
    const jobKey = jobId[1];
    console.log(`Retrieved Job: ${jobKey}`);

    // Fetch the job details from Redis
    const jobDetails = await redis.hgetall(jobKey);

    // Check Dependencies of the Job
    const dependencies = await redis.smembers(`${jobKey}:dependencies`);

    if (dependencies.length > 0) {
      console.log(`Job ${jobKey} is waiting for dependencies: `, dependencies);
      await redis.lpush(queueName, jobKey);
      return;
    }

    // Check if the job is cancelled
    if (jobDetails.status === "CANCELLED") {
      console.log(`Job ${jobKey} is cancelled. Skipping.`);
      return;
    }

    await redis.hset(jobKey, "status", "PROCESSING");

    try {
      console.log(`Processing Job: ${jobKey}`);

      // Simulate job progress in steps
      for (let progress = 0; progress <= 100; progress += 10) {
        // Check if the job is cancelled mid progress
        if (await isJobCancelled(jobKey)) {
          console.log(`Job ${jobKey} cancelled mid-progress. Stopping.`);
          await redis.hset(jobKey, "status", "CANCELLED");
          return;
        }

        await updateJobProgress(jobKey, progress);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      await redis.hset(jobKey, {
        status: "COMPLETED",
        result: `Success Result of Job ${jobKey} `,
      });

      // Notify dependent jobs
      const dependents = await redis.smembers(`${jobKey}:dependents`);
      for (const dependent of dependents) {
        await redis.srem(`${dependent}:dependencies`, jobKey);
        console.log(`Notified dependent job ${dependent}`);
      }
    } catch (error) {
      console.error(`Job ${jobKey} failed: `, error);
      const retries = await redis.hincrby(jobKey, "retries", 1);

      if (retries >= 3) {
        await redis.hset(jobKey, "status", "FAILED");
        await redis.lpush("dead_letter_queue", jobKey);
        console.log(`Job ${jobKey} moved to dead letter queue`);
      } else {
        console.log(`Retrying job ${jobKey}`);
        await redis.lpush(queueName, jobKey);
      }
    }
  }
}

// FUNCTION TO SEND WORKER HEARTBEAT
async function sendHeartbeat() {
  try {
    await redis.hmset(workerId, {
      status: "ALIVE",
      queue: queueName,
      last_seen: Date.now(),
    });
    // AUTO EXPIRE WORKER KEY AFTER 10 SECONDS IF NO HEARTBEAT
    await redis.expire(workerId, 10);
    console.log(`Heartbeat sent for ${workerId}`);
  } catch (error) {
    console.error(`Error sending heartbeat: ${error}`);
  }
}

// Periodically send heartbeats every 5 seconds
setInterval(sendHeartbeat, 5000);

// Worker Execution
(async () => {
  console.log(`Worker listening on queue: ${queueName}`);

  while (true) {
    await processJob(queueName);
  }
})();
