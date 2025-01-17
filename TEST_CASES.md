# Test Cases Demonstrating System Reliability

### **What to Include:**

- Test cases for core functionalities:
  - **Job Queueing**: Verify jobs are queued and processed in order.
  - **Auto-Scaling**: Validate that worker instances scale based on queue length
  - **Redis Failover**: Ensure jobs are not lost during Redis master failure
  - **Job Cancellation**: Confirm that cancelled jobs are removed from the queue
  - **Dependency Management**: Test dependent jobs are processed after prerequisites.

## Test Cases

### Test 1: Job Queueing and Processing

**Steps**:

1. Enqueue 100 jobs with different priorities.
2. Start the workers.
3. Monitor job processing order.

**Expected Result**:

- High-priority jobs are processed before normal jobs.

### Test 2: Auto-Scaling

**Steps**:

1. Enqueue 1000 jobs.
2. Start the monitoring script.
3. Observe worker instances in the Auto-Scaling Group.

**Expected Result**:

- Workers scale up to handle the queue and scale down when the queue is empty.

### Test 3: Redis Failover

**Steps**:

1. Enqueue jobs.
2. Simulate a Redis master node failure.
3. Verify job recovery and continued processing.

**Expected Result**:

- Jobs resume processing after failover with no data loss.

### Test 4: Job Cancellation

**Steps**:

1. Enqueue a job.
2. Cancel the job.
3. Monitor the queue and workers.

**Expected Result**:

- The cancelled job is not processed.

### Test 5: Dependency Management

**Steps**:

1. Enqueue Job A with dependencies on Job B and Job C.
2. Process Job B and Job C first.
3. Verify Job A starts processing only after its dependencies are completed.

**Expected Result**:

- Job dependencies are respected.
