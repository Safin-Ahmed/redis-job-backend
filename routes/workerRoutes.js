const express = require("express");
const router = express.Router();
const workerController = require("../controllers/workerController");

router.get("/", workerController.getWorkerHealth);

module.exports = router;
