import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PAGES_PREVIEW_PORT || 4174);
const repository =
  process.env.GITHUB_REPOSITORY?.split("/").pop() || "lvji-travel";
const prefix = `/${repository}`;
const root = join(process.cwd(), "out");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

if (!existsSync(join(root, "index.html"))) {
  console.error("没有找到 out/index.html，请先运行 npm run build:pages。");
  process.exit(1);
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  if (pathname === "/") {
    response.writeHead(302, { location: `${prefix}/` });
    response.end();
    return;
  }
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const relative = pathname.slice(prefix.length).replace(/^\/+/, "");
  let file = normalize(join(root, relative || "index.html"));
  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) && !extname(file)) file = `${file}.html`;
  if (!existsSync(file)) file = join(root, "404.html");

  response.writeHead(existsSync(file) ? 200 : 404, {
    "content-type": contentTypes[extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`GitHub Pages Demo: http://localhost:${port}${prefix}/`);
});
