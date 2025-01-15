const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const jobRoutes = require("./routes/jobRoutes");
const workerRoutes = require("./routes/workerRoutes");

require("dotenv").config();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Routes
app.use("/api/jobs", jobRoutes);

// Worker Routes
app.use("/api/workers", workerRoutes);

// Start server
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
