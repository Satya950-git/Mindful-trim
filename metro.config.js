const path = require("path");
const http = require("http");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  blockList: [
    /\/\.local\/.*/,
    /\/\.git\/.*/,
  ],
  // expo/fetch is not listed in expo's package.json exports map but the
  // file exists on disk. With unstable_enablePackageExports=true Metro
  // would fail to resolve it, so we redirect it explicitly.
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === "expo/fetch") {
      return {
        filePath: path.resolve(__dirname, "node_modules/expo/fetch.js"),
        type: "sourceFile",
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

config.server = {
  ...(config.server || {}),
  enhanceMiddleware: (metroMiddleware) => {
    return (req, res, next) => {
      if (req.url && req.url.startsWith("/api")) {
        const options = {
          host: "localhost",
          port: 5000,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: "localhost:5000" },
        };
        const proxyReq = http.request(options, (proxyRes) => { // nosemgrep: problem-based-packs.insecure-transport.js-node.using-http-server
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });
        req.pipe(proxyReq, { end: true });
        proxyReq.on("error", (err) => {
          console.error("[Metro API proxy error]", err.message);
          if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Backend unavailable" }));
          }
        });
      } else {
        metroMiddleware(req, res, next);
      }
    };
  },
};

module.exports = config;
