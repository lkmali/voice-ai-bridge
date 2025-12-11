import express from "express"
import bodyParser from "body-parser"
import exotelWebhooks from "./exotel/exotel.webhook.controller"
import callController from "./exotel/call.controller"
import path from "path"

const app = express()

// Exotel may POST urlencoded form data; enable both
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

// Static UI (optional)
app.use(express.static(path.join(__dirname, "../public")))

app.use("/exotel", exotelWebhooks)
app.use("/api", callController)

// health
app.get("/ping", (req, res) => res.json({ ok: true }))

export default app
