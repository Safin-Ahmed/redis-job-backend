# Infrastructure Documentation for Job Queue System

## Overview

This document outlines the infrastructure setup for the distributed job queue system. The infrastructure is managed using **Pulumi** and deployed on **AWS**. It includes the following components:

1. **Virtual Private Cloud (VPC)**:
   - Custom VPC with public subnets across multiple availability zones.
2. **Redis (Elasticache)**:
   - Managed Redis instance for job queue management.
3. **EC2 Instances**:
   - Worker nodes for job processing.
   - Monitoring instance for auto-scaling logic.
   - Frontend instance for the Vite React dashboard.
   - Grafana instance for setting up otel and grafana for tracing and visualization.
4. **Security Groups**:
   - Restrict access to Redis, workers, and monitoring.
5. **Auto-Scaling**:
   - Auto-scaling group for worker instances based on queue length.

---

## Pulumi Infrastructure Setup

### Prerequisites

1. **Pulumi**:
   - Install Pulumi CLI: https://www.pulumi.com/docs/get-started/
2. **AWS CLI**:
   - Configure AWS credentials:
     ```bash
     aws configure
     ```
3. **Node.js**:
   - Install Node.js and npm: https://nodejs.org/
4. **Pulumi Project Initialization**:
   - Initialize a Pulumi project in the `infra` folder:
     ```bash
     pulumi new aws-javascript
     ```

### Pulumi Folder Structure

The `infra` folder contains Pulumi scripts for provisioning AWS resources:
infra/
├── index.js # Main Pulumi script
├── package.json # Node.js dependencies
├── Pulumi.dev.yaml # Pulumi configuration for the development environment
└── Pulumi.yaml # Pulumi project metadata

---

## Infrastructure Components

### 1. Virtual Private Cloud (VPC)

- A custom VPC is created with the following:
  - **CIDR Block**: `10.0.0.0/16`
  - **Public Subnets**: Three subnets, one in each availability zone.
  - **Internet Gateway**: Enables public access for EC2 instances.
  - **Route Table**: Routes traffic to the Internet Gateway.

### 2. Redis

- **Node Type**: `t3.micro`
- **Subnet Group**: Associated with public subnets.
- **Security Group**: Allows internal access to Redis from workers and monitoring instances.

### 3. EC2 Instances

- **Worker Instances**:
  - Dynamically scaled based on queue length.
  - Uses a launch template for consistent configuration.
- **Monitoring Instance**:
  - Runs the monitoring script to handle worker scaling.
- **Frontend Instance**:
  - Hosts the Vite React dashboard.

### 4. Security Groups

- **Redis Security Group**:
  - Allows access on port `6379` from workers and monitoring instances.
- **Worker Security Group**:
  - Allows internal communication and SSH access.
- **Frontend Security Group**:
  - Allows HTTP traffic on port `80`.

### 5. Auto-Scaling

- Configured for worker instances:
  - **Min Size**: 1 instance
  - **Max Size**: 10 instances
  - **Scaling Policy**: Based on Redis queue length monitored by the script.

---

## Pulumi Script Example

### `index.js`

```javascript
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

// Create a VPC
const vpc = new aws.ec2.Vpc("job-queue-vpc", {
  cidrBlock: "10.0.0.0/16",
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { Name: "job-queue-vpc" },
});

// Create Subnets
const subnets = ["a", "b", "c"].map(
  (az, i) =>
    new aws.ec2.Subnet(`subnet-${az}`, {
      vpcId: vpc.id,
      cidrBlock: `10.0.${i + 1}.0/24`,
      availabilityZone: `us-east-1${az}`,
      mapPublicIpOnLaunch: true,
      tags: { Name: `subnet-${az}` },
    })
);

// Internet Gateway
const igw = new aws.ec2.InternetGateway("job-queue-igw", {
  vpcId: vpc.id,
  tags: { Name: "job-queue-igw" },
});

// Route Table
const routeTable = new aws.ec2.RouteTable("job-queue-rt", {
  vpcId: vpc.id,
  routes: [{ cidrBlock: "0.0.0.0/0", gatewayId: igw.id }],
  tags: { Name: "job-queue-rt" },
});

// Associate Route Table with Subnets
subnets.forEach((subnet, i) => {
  new aws.ec2.RouteTableAssociation(`rta-${i}`, {
    subnetId: subnet.id,
    routeTableId: routeTable.id,
  });
});

// Redis Cluster
const redis = new aws.elasticache.Cluster("job-queue-redis", {
  nodeType: "cache.t3.micro",
  numCacheNodes: 1,
  engine: "redis",
  subnetGroupName: new aws.elasticache.SubnetGroup("redis-subnet-group", {
    subnetIds: subnets.map((s) => s.id),
  }).name,
  securityGroupIds: [
    new aws.ec2.SecurityGroup("redis-sg", {
      vpcId: vpc.id,
      ingress: [
        {
          protocol: "tcp",
          fromPort: 6379,
          toPort: 6379,
          cidrBlocks: ["10.0.0.0/16"],
        },
      ],
      egress: [
        { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
      ],
    }).id,
  ],
  tags: { Name: "job-queue-redis" },
});

// Launch Template for Workers
const launchTemplate = new aws.ec2.LaunchTemplate("worker-template", {
  instanceType: "t2.micro",
  amiId: "ami-12345678", // Replace with valid AMI ID
  userData: pulumi.interpolate`#!/bin/bash
    export REDIS_HOST=${redis.cacheNodes[0].address}
    export REDIS_PORT=6379
    cd /home/ubuntu/worker
    npm install
    node worker.js
    `,
  tags: { Name: "worker-template" },
});

// Auto-Scaling Group
const asg = new aws.autoscaling.Group("worker-asg", {
  vpcZoneIdentifiers: subnets.map((s) => s.id),
  desiredCapacity: 1,
  maxSize: 10,
  minSize: 1,
  launchTemplate: {
    id: launchTemplate.id,
    version: "$Latest",
  },
  tags: [{ key: "Name", value: "worker-instance", propagateAtLaunch: true }],
});

exports.vpcId = vpc.id;
exports.redisEndpoint = redis.cacheNodes[0].address;
exports.workerAsg = asg.id;
```

<br />

# Deployment Instructions

### 1. Initialize Pulumi Project

```
cd infra
pulumi login
pulumi stack init dev
```

### 2. Configure AWS Credentials

```
aws configure
```

### 3. Deploy Infrastructure

```
pulumi up
```

### 4. Outputs

After deployment, Pulumi will output important details like:

- VPC ID
- Redis Endpoint
- Auto Scaling Group ID
