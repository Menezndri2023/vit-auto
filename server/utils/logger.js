import { createLogger, format, transports } from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd    = process.env.NODE_ENV === "production";

const { combine, timestamp, errors, json, colorize, printf } = format;

// Format console lisible en développement
const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${ts} [${level}] ${stack || message}${metaStr}`;
});

const logger = createLogger({
  level: isProd ? "info" : "debug",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    isProd ? json() : combine(colorize(), devFormat)
  ),
  transports: [
    new transports.Console(),
    // En production : fichiers rotatifs
    ...(isProd ? [
      new transports.File({
        filename: path.join(__dirname, "../logs/error.log"),
        level:    "error",
        maxsize:  10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
      }),
      new transports.File({
        filename: path.join(__dirname, "../logs/combined.log"),
        maxsize:  20 * 1024 * 1024,
        maxFiles: 10,
      }),
    ] : []),
  ],
  // Ne pas crash si transport échoue
  exitOnError: false,
});

// Remplacer console.log en production pour uniformiser
if (isProd) {
  console.log   = (...a) => logger.info(a.join(" "));
  console.error = (...a) => logger.error(a.join(" "));
  console.warn  = (...a) => logger.warn(a.join(" "));
}

export default logger;
