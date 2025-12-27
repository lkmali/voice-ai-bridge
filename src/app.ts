import express from "express"
import bodyParser from "body-parser"
import exotelWebhooks from "./exotel/exotel.webhook.controller"
import callController from "./exotel/call.controller"
import path from "path"
import { EXOTEL_STREAM_PATH } from "./config"

const app = express()

// Exotel may POST urlencoded form data; enable both
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// Static UI - serve from root public folder
app.use(express.static(path.join(__dirname, "../public")))

app.use("/exotel", exotelWebhooks)
app.use("/api", callController)

// Config endpoint for HTML client
app.get("/api/config", (req, res) => res.json({ wsPath: EXOTEL_STREAM_PATH }))

// Health check
app.get("/ping", (req, res) => res.json({ ok: true }))

export default app
