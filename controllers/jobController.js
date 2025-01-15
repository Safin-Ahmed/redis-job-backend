const { v4: uuidv4 } = require("uuid");

const redis = require("../redisClient");

// Enqueue a job
exports.enqueueJob = async (req, res) => {
  try {
    const { type, data, priority = "normal", dependencies = [] } = req.body;

    const jobId = `job:${uuidv4()}`;
    const queueName =
      priority === "high" ? "high_priority_jobs" : "normal_jobs";

    await redis.lpush(queueName, jobId);
    await redis.hmset(jobId, {
      status: "PENDING",
      type,
      data: JSON.stringify(data),
      retries: 0,
      progress: 0,
      created_at: Date.now(),
    });

    for (const dependency of dependencies) {
      await redis.sadd(`${jobId}:dependencies`, dependency);
      await redis.sadd(`${dependency}:dependents`, jobId);
    }

    res.status(201).json({ success: true, message: "Job enqueued", jobId });
  } catch (error) {
    console.error("Error enqueuing job: ", error);
    res.status(500).json({ success: false, message: "Failed to enqueue job" });
  }
};

// Check Job Status
exports.getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await redis.hgetall(jobId);

    if (!job || Object.keys(job).length === 0) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    res.status(200).json({ success: true, job });
  } catch (error) {
    console.error("Error fetching job status: ", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch job status" });
  }
};

// Get all jobs (monitoring)
exports.getAllJobs = async (req, res) => {
  try {
    const jobKeys = await redis.keys("job:*");
    const jobs = [];

    for (const key of jobKeys) {
      const job = await redis.hgetall(key);
      jobs.push({ jobId: key, ...job });
    }

    res.status(200).json({ success: true, jobs });
  } catch (error) {}
};

// Get all job ids
exports.getAllJobIds = async (req, res) => {
  try {
    // Fetch all job keys
    const jobKeys = await redis.keys("job:*");

    // Return only ids
    res.status(200).json({ success: true, jobIds: jobKeys });
  } catch (error) {
    console.error("Error fetching job IDs: ", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch job IDs" });
  }
};

// Get Job Result
exports.getJobResult = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await redis.hgetall(jobId);

    if (!job || Object.keys(job).length === 0) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.status(200).json({ success: true, result: job.result });
  } catch (error) {
    console.error("Error fetching job result: ", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch job result" });
  }
};

// GET JOB STATS FOR DASHBOARD
exports.getJobStats = async (req, res) => {
  try {
    const jobKeys = await redis.keys("job:*");
    const stats = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
    };

    for (const key of jobKeys) {
      const status = await redis.hget(key, "status");
      stats[status] = (stats[status] || 0) + 1;
    }

    return res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error("Error fetching job stats: ", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
};

// Cancel a JOB
exports.cancelJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await redis.hgetall(jobId);

    if (!job || Object.keys(job).length === 0) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    // Only allow cancellation if job is PENDING or PROCESSING
    if (job.status === "PENDING" || job.status === "PROCESSING") {
      await redis.hset(jobId, "status", "CANCELLED");
      return res.status(200).json({ success: true, message: "Job cancelled" });
    }

    res.status(400).json({
      success: false,
      message: "Cannot cancel completed or failed jobs",
    });
  } catch (error) {
    console.error("Error cancelling job: ", error);
    res.status(500).json({ success: false, message: "Failed to cancel job" });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const { jobId } = req.params;

    // Delete the job
    const jobExists = await redis.exists(jobId);

    if (!jobExists) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    // Remove job metadata and dependencies
    await redis.del(jobId);
    await redis.del(`${jobId}:dependencies`);
    await redis.del(`${jobId}:dependents`);

    res
      .status(200)
      .json({ success: true, message: "Job deleted successfully" });
  } catch (err) {
    console.error("Error deleting job: ", err);
    res.status(500).json({ success: false, message: "Failed to delete job" });
  }
};
