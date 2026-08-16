const { spawn } = require("child_process");
const PORT = 4785;
const child = spawn(process.execPath, [".output/server/index.mjs"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "inherit",
});
setTimeout(async () => {
  try {
    const res = await fetch(`http://localhost:${PORT}/`);
    const text = await res.text();
    console.log("STATUS", res.status);
    console.log("HAS_HTML", text.includes("<html"));
    console.log("LEN", text.length);
    console.log("HAS_ROOT", text.includes('id="root"') || text.includes("__TSR__") || text.includes("/assets/"));
  } catch (e) {
    console.log("FETCH_ERR", e.message);
  }
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 500);
  process.exit(0);
}, 3500);