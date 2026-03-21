import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import osc from "osc";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const OSC_PORT = 9000;

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`OSC UDP listening on port ${OSC_PORT}`);
  });

  // WebSocket Server
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");
    ws.on("close", () => console.log("WebSocket client disconnected"));
  });

  // OSC UDP Port
  const udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: OSC_PORT,
    metadata: true
  });

  udpPort.on("message", (oscMsg) => {
    console.log("OSC Message received:", oscMsg);
    // Broadcast to all WebSocket clients
    const message = JSON.stringify({
      type: "OSC_MESSAGE",
      data: oscMsg
    });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  });

  udpPort.on("error", (err) => {
    console.error("OSC UDP Error:", err);
  });

  udpPort.open();
}

startServer();
