const express = require("express");
const router = express.Router();
const jobController = require("../controllers/jobController");

// Enqueue a job
router.post("/", jobController.enqueueJob);

// Get all jobs
router.get("/", jobController.getAllJobs);

// Get all job ids
router.get("/ids", jobController.getAllJobIds);

// Get Job Stats
router.get("/stats", jobController.getJobStats);

// Get job status
router.get("/:jobId", jobController.getJobStatus);

// Get job result
router.get("/:jobId/result", jobController.getJobResult);

// Delete a job
router.delete("/:jobId", jobController.deleteJob);

// Cancel Job
router.get("/:jobId/cancel", jobController.cancelJob);

module.exports = router;
