import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { streamSSE } from "hono/streaming";
import { errorResponse } from "../openapi.js";
import { ConnectionLimitExceeded, articleBroker } from "../services/sse-broker.js";
import type { AppEnv } from "../types.js";

const sseRoute = new Hono<AppEnv>();

sseRoute.get(
  "/articles/stream",
  describeRoute({
    tags: ["Articles"],
    summary: "Server-Sent Events: a `new_article` event per stored article, `ping` on connect",
    responses: {
      200: {
        description: "Event stream",
        content: { "text/event-stream": { schema: { type: "string" } } },
      },
      503: errorResponse("Too many SSE connections"),
    },
  }),
  async (c) => {
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
  },
);

export { sseRoute };
