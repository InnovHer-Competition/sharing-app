// Runs the API and the web app together: `npm run dev`.
import { spawn } from "node:child_process";

const apps = [
  { name: "api", workspace: "@pcos/server", color: 35 },
  { name: "web", workspace: "@pcos/web", color: 36 },
];

const children = apps.map(({ name, workspace, color }) => {
  const child = spawn(`pnpm --filter ${workspace} dev`, { shell: true, env: process.env });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (chunk) => out.write(chunk.toString().replace(/^(?=.)/gm, prefix)));
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

function shutdown(code) {
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
