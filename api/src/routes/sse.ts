import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ConnectionLimitExceeded, articleBroker } from "../services/sse-broker.js";

const sseRoute = new Hono();

sseRoute.get("/articles/stream", async (c) => {
  let clientId: number;
  try {
    clientId = articleBroker.subscribe();
  } catch (err) {
    if (err instanceof ConnectionLimitExceeded) {
      return c.json({ detail: "Too many SSE connections" }, 503);
    }
    throw err;
  }

  return streamSSE(c, async (stream) => {
    try {
      let running = true;

      stream.onAbort(() => {
        running = false;
        articleBroker.unsubscribe(clientId);
      });

      // Send initial ping
      await stream.writeSSE({ data: "", event: "ping" });

      while (running) {
        const event = await articleBroker.waitForEvent(clientId, 1000);
        if (event) {
          await stream.writeSSE({
            data: JSON.stringify(event),
            event: "new_article",
          });
        }
      }
    } finally {
      articleBroker.unsubscribe(clientId);
    }
  });
});

export { sseRoute };
