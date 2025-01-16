require("dotenv").config();

const AWS = require("aws-sdk");

const redis = require("./redisClient");

// AWS CONFIG
AWS.config.update({ region: "ap-southeast-1" });

const ec2 = new AWS.EC2();

// Scaling Parameters
const SCALE_UP_THRESHOLD = 50; // Jobs in the queue to trigger scale-up
const SCALE_DOWN_THRESHOLD = 10; // Jobs in the queue to trigger scale-down
const MIN_WORKERS = 1; // Minimum number of workers
const MAX_WORKERS = 10; // Maximum number of workers

// Launch Template for Workers
const LAUNCH_TEMPLATE_ID = "lt-12345678"; // Replace with your Launch Template ID

// Helper to get Redis queue length
const getQueueLength = async (queueName) => {
  try {
    const length = await redis.llen(queueName);
    return length;
  } catch (error) {
    console.error(`Error fetching queue length for ${queueName}:`, error);
    return 0;
  }
};

// Fetch active worker instances
const getActiveInstances = async () => {
  try {
    const data = await ec2
      .describeInstances({
        Filters: [
          { Name: "tag:Role", Values: ["worker"] },
          { Name: "instance-state-name", Values: ["running", "pending"] },
        ],
      })
      .promise();

    return data.Reservations.flatMap((r) =>
      r.Instances.map((i) => i.InstanceId)
    );
  } catch (error) {
    console.error("Error fetching active instances:", error);
    return [];
  }
};

// Scale up workers
const scaleUp = async (count) => {
  console.log(`Scaling up by ${count} workers...`);
  try {
    const response = await ec2
      .runInstances({
        LaunchTemplate: { LaunchTemplateId: LAUNCH_TEMPLATE_ID },
        MinCount: count,
        MaxCount: count,
      })
      .promise();

    const instanceIds = response.Instances.map((i) => i.InstanceId);
    await ec2
      .createTags({
        Resources: instanceIds,
        Tags: [{ Key: "Role", Value: "worker" }],
      })
      .promise();

    console.log(`Launched instances: ${instanceIds.join(", ")}`);
  } catch (error) {
    console.error("Error scaling up:", error);
  }
};

// Scale down workers
const scaleDown = async (count, activeInstances) => {
  console.log(`Scaling down by ${count} workers...`);
  const instancesToTerminate = activeInstances.slice(0, count);

  try {
    await ec2
      .terminateInstances({ InstanceIds: instancesToTerminate })
      .promise();
    console.log(`Terminated instances: ${instancesToTerminate.join(", ")}`);
  } catch (error) {
    console.error("Error scaling down:", error);
  }
};

// Main Monitoring Loop
const monitorQueue = async () => {
  try {
    // Fetch queue lengths
    const highPriorityJobs = await getQueueLength("high_priority_jobs");
    const normalJobs = await getQueueLength("normal_jobs");
    const totalJobs = highPriorityJobs + normalJobs;

    console.log(
      `High Priority: ${highPriorityJobs}, Normal: ${normalJobs}, Total: ${totalJobs}`
    );

    // Fetch active instances
    const activeInstances = await getActiveInstances();
    console.log(`Active instances: ${activeInstances.length}`);

    if (
      totalJobs > SCALE_UP_THRESHOLD &&
      activeInstances.length < MAX_WORKERS
    ) {
      const scaleUpCount = Math.min(
        totalJobs - SCALE_UP_THRESHOLD,
        MAX_WORKERS - activeInstances.length
      );
      await scaleUp(scaleUpCount);
    } else if (
      totalJobs < SCALE_DOWN_THRESHOLD &&
      activeInstances.length > MIN_WORKERS
    ) {
      const scaleDownCount = Math.min(
        activeInstances.length - MIN_WORKERS,
        SCALE_DOWN_THRESHOLD - totalJobs
      );
      await scaleDown(scaleDownCount, activeInstances);
    } else {
      console.log("No scaling action required.");
    }
  } catch (error) {
    console.error("Error in monitoring loop:", error);
  }
};

// Run monitoring loop periodically
const startMonitoring = () => {
  console.log("Starting queue monitoring...");
  setInterval(monitorQueue, 10000); // Run every 10 seconds
};

if (require.main === module) {
  startMonitoring();
}

module.exports = { startMonitoring };
