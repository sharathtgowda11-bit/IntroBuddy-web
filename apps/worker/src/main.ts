import "./loadEnv.js";
import { getEnv } from "./env.js";
import { pollLoop } from "./pollLoop.js";

getEnv(); // fail fast on missing/invalid env, before starting anything

const controller = new AbortController();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down worker...`);
    controller.abort();
  });
}

console.log("IntroBuddy worker started");
pollLoop(controller.signal).catch((error) => {
  console.error("worker poll loop crashed", error);
  process.exitCode = 1;
});
