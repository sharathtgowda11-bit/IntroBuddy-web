import "./loadEnv.js";
import { createApp } from "./app.js";
import { getEnv } from "./env.js";

const env = getEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`IntroBuddy API listening on port ${env.PORT}`);
});
