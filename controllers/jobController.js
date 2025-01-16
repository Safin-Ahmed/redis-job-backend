const { v4: uuidv4 } = require("uuid");

const redis = require("../redisClient");
const { trace } = require("@opentelemetry/api");

// Enqueue a job
exports.enqueueJob = async (req, res) => {
  const span = trace.getTracer("redis-job-service").startSpan("enqueue_job");
  try {
    const { type, data, priority = "normal", dependencies = [] } = req.body;

    const jobId = `job:${uuidv4()}`;

    const queueName =
      priority === "high" ? "high_priority_jobs" : "normal_jobs";

    span.setAttributes({ type, data, priority, dependencies, jobId });

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
    span.recordException(error);
    console.error("Error enqueuing job: ", error);
    res.status(500).json({ success: false, message: "Failed to enqueue job" });
  } finally {
    span.end();
  }
};

// Check Job Status
exports.getJobStatus = async (req, res) => {
  const span = trace.getTracer("redis-job-service").startSpan("get_job_status");
  try {
    const { jobId } = req.params;
    const job = await redis.hgetall(jobId);
    span.setAttributes({ jobId });

    if (!job || Object.keys(job).length === 0) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    res.status(200).json({ success: true, job });
  } catch (error) {
    console.error("Error fetching job status: ", error);
    span.recordException(error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch job status" });
  } finally {
    span.end();
  }
};

// Get all jobs (monitoring)
exports.getAllJobs = async (req, res) => {
  const span = trace.getTracer("redis-job-service").startSpan("get_all_jobs");
  try {
    const jobKeys = await redis.keys("job:*");
    const jobs = [];

    for (const key of jobKeys) {
      const job = await redis.hgetall(key);
      jobs.push({ jobId: key, ...job });
    }

    res.status(200).json({ success: true, jobs });
  } catch (error) {
    span.recordException(error);
  } finally {
    span.end();
  }
};

// Get all job ids
exports.getAllJobIds = async (req, res) => {
  const span = trace.getTracer("redis-job-service").startSpan("get_all_jobs");
  try {
    // Fetch all job keys
    const jobKeys = await redis.keys("job:*");

    // Return only ids
    res.status(200).json({ success: true, jobIds: jobKeys });
  } catch (error) {
    console.error("Error fetching job IDs: ", error);
    span.recordException(error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch job IDs" });
  } finally {
    span.end();
  }
};

// Get Job Result
exports.getJobResult = async (req, res) => {
  const span = trace.getTracer("redis-job-service").startSpan("get_job_result");
  try {
    const { jobId } = req.params;
    const job = await redis.hgetall(jobId);

    span.setAttributes({ jobId });

    if (!job || Object.keys(job).length === 0) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }

    return res.status(200).json({ success: true, result: job.result });
  } catch (error) {
    span.recordException(error);
    console.error("Error fetching job result: ", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch job result" });
  } finally {
    span.end();
  }
};

// GET JOB STATS FOR DASHBOARD
exports.getJobStats = async (req, res) => {
  const span = trace.getTracer("redis-job-service").startSpan("get_job_stats");
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
    span.recordException(error);
    console.error("Error fetching job stats: ", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  } finally {
    span.end();
  }
};

// Cancel a JOB
exports.cancelJob = async (req, res) => {
  const span = trace.getTracer("redis-job-service").startSpan("cancel_job");
  try {
    const { jobId } = req.params;
    const job = await redis.hgetall(jobId);

    span.setAttributes({ jobId });

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
    span.recordException(error);
    console.error("Error cancelling job: ", error);
    res.status(500).json({ success: false, message: "Failed to cancel job" });
  } finally {
    span.end();
  }
};

exports.deleteJob = async (req, res) => {
  const span = trace.getTracer("redis-job-service").startSpan("delete_job");
  try {
    const { jobId } = req.params;

    span.setAttributes({ jobId });

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
    span.recordException(err);
    console.error("Error deleting job: ", err);
    res.status(500).json({ success: false, message: "Failed to delete job" });
  } finally {
    span.end();
  }
};
