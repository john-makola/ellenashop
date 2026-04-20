// cPanel Node.js App Manager expects a CommonJS entry point.
// This file bootstraps the ESM backend.
import("./dist/index.js").catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
