import http from "http"
import app from "./app"
import { createStreamServer } from "./exotel/exotel.stream.server"
import { APP_PORT, EXOTEL_STREAM_PATH } from "./config"
import { logger } from "./logger"

const server = http.createServer(app)

// Single WebSocket server at EXOTEL_STREAM_PATH
// Auto-detects client type (Exotel or HTML) from message format
createStreamServer(server, EXOTEL_STREAM_PATH)

server.listen(APP_PORT, () => {
  logger.info(`Server ready on port ${APP_PORT}`)
  logger.info(`HTML UI: http://localhost:${APP_PORT}`)
  logger.info(`WebSocket: ws://localhost:${APP_PORT}${EXOTEL_STREAM_PATH}`)
})
