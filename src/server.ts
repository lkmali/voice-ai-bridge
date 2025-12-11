import http from "http"
import app from "./app"
import { createExotelStreamServer } from "./exotel.stream.server"
import { APP_PORT, EXOTEL_STREAM_PATH } from "./config"
import { logger } from "./logger"

const server = http.createServer(app)

// Start WebSocket server at EXOTEL_STREAM_PATH (Exotel will use wss://<host><path>)
createExotelStreamServer(server, EXOTEL_STREAM_PATH)

server.listen(APP_PORT, () => {
  logger.info(`Server ready on port ${APP_PORT}`)
  logger.info(`Exotel stream WS path: ${EXOTEL_STREAM_PATH}`)
})
