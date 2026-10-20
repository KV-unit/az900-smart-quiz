// Minimal static file server used by `npm start` and the browser test (no dependencies).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const file = resolve(root, "." + pathname);
      const rel = relative(root, file);
      if (rel.startsWith("..") || rel.split(/[\\/]/).some((part) => part === "node_modules" || part === ".git")) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  return new Promise((resolvePromise) =>
    server.listen(port, "127.0.0.1", () => resolvePromise({ server, port: server.address().port })),
  );
}

// Run directly (`npm start`): serve the app at http://127.0.0.1:8080
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await startServer(8080);
  console.log(`Serving AZ-900 Smart Quiz at http://127.0.0.1:${port}  (press Ctrl+C to stop)`);
}
