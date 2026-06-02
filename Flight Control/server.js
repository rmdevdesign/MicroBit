const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const root = __dirname;
const host = "127.0.0.1";
const startPort = 8080;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function serveFile(request, response) {
  const url = new URL(request.url, `http://${host}`);
  const relativePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
}

function openBrowser(url) {
  const commandByPlatform = {
    darwin: `open "${url}"`,
    win32: `start "" "${url}"`,
  };
  const command = commandByPlatform[process.platform] || `xdg-open "${url}"`;
  exec(command);
}

function listen(port) {
  const server = http.createServer(serveFile);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < startPort + 20) {
      listen(port + 1);
      return;
    }

    console.error(error.message);
    process.exit(1);
  });

  server.listen(port, host, () => {
    const url = `http://localhost:${port}`;
    console.log(`Micro:bit Flight Controller: ${url}`);
    openBrowser(url);
  });
}

listen(startPort);
