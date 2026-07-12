import express from "express";
import "dotenv/config";
import webhookRoute from "./routes/webhook.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("ClockWA backend is running."));
app.use("/webhook", webhookRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ClockWA backend listening on port ${PORT}`));
