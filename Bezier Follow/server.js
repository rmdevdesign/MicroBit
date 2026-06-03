const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const root = __dirname;
const host = "127.0.0.1";
const preferredPort = Number(process.env.PORT) || 8081;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serveFile(request, response) {
  const requestPath = decodeURIComponent(new URL(request.url, `http://${host}`).pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.resolve(root, relativePath);
  const rootRelativePath = path.relative(root, filePath);

  if (rootRelativePath.startsWith("..") || path.isAbsolute(rootRelativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
}

function openBrowser(url) {
  if (process.env.NO_OPEN === "1") return;

  const commandByPlatform = {
    darwin: `open "${url}"`,
    win32: `start "" "${url}"`,
  };
  const command = commandByPlatform[process.platform] || `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      console.warn(`Impossible d'ouvrir le navigateur automatiquement: ${error.message}`);
    }
  });
}

function createServer(port) {
  const server = http.createServer(serveFile);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < preferredPort + 20) {
      createServer(port + 1);
      return;
    }

    console.error(error.message);
    process.exit(1);
  });

  server.listen(port, host, () => {
    const url = `http://localhost:${port}`;
    console.log(`Bezier Follow: ${url}`);
    openBrowser(url);
  });
}

createServer(preferredPort);
