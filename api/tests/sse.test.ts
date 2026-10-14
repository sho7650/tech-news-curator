import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ConnectionLimitExceeded, SSEBroker, articleBroker } from "../src/services/sse-broker.js";
import { waitForBrokerDrain } from "./helpers.js";
import { getTestDb } from "./setup.js";

describe("SSE Broker", () => {
  it("should broadcast events to all subscribers", async () => {
    const broker = new SSEBroker();
    const id1 = broker.subscribe();
    const id2 = broker.subscribe();

    const event = { id: "1", title_ja: "テスト記事" };
    await broker.broadcast(event);

    const e1 = await broker.waitForEvent(id1, 100);
    const e2 = await broker.waitForEvent(id2, 100);
    expect(e1).toEqual(event);
    expect(e2).toEqual(event);
  });

  it("should not receive events after unsubscribe", async () => {
    const broker = new SSEBroker();
    const id = broker.subscribe();
    broker.unsubscribe(id);

    await broker.broadcast({ id: "1" });
    const result = await broker.waitForEvent(id, 100);
    expect(result).toBeNull();
    expect(broker.clientCount).toBe(0);
  });

  it("should drop events when queue is full", async () => {
    const broker = new SSEBroker();
    const id = broker.subscribe();

    // Fill the queue (64 events)
    for (let i = 0; i < 64; i++) {
      await broker.broadcast({ id: String(i) });
    }

    // This should be dropped (queue full)
    await broker.broadcast({ id: "overflow" });

    // Read all buffered events
    let count = 0;
    while (true) {
      const e = await broker.waitForEvent(id, 50);
      if (!e) break;
      count++;
    }
    expect(count).toBe(64); // overflow was dropped
  });

  it("should return null on timeout", async () => {
    const broker = new SSEBroker();
    const id = broker.subscribe();
    const result = await broker.waitForEvent(id, 50);
    expect(result).toBeNull();
  });

  it("should track client count", async () => {
    const broker = new SSEBroker();
    expect(broker.clientCount).toBe(0);
    const id1 = broker.subscribe();
    expect(broker.clientCount).toBe(1);
    const id2 = broker.subscribe();
    expect(broker.clientCount).toBe(2);
    broker.unsubscribe(id1);
    expect(broker.clientCount).toBe(1);
    broker.unsubscribe(id2);
    expect(broker.clientCount).toBe(0);
  });
});

describe("GET /articles/stream (route)", () => {
  it("opens an event stream, sends an initial ping, and unsubscribes on abort", async () => {
    const app = createApp(getTestDb());
    const controller = new AbortController();
    const res = await app.request("/articles/stream", { signal: controller.signal });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(articleBroker.clientCount).toBe(1);
    const reader = res.body?.getReader();
    const { value } = (await reader?.read()) ?? {};
    expect(new TextDecoder().decode(value)).toContain("event: ping");

    controller.abort();
    await reader?.cancel();
    await waitForBrokerDrain();
  });

  it("returns 503 when the broker connection cap is reached", async () => {
    const app = createApp(getTestDb());
    const ids: number[] = [];
    try {
      while (articleBroker.clientCount < 20) ids.push(articleBroker.subscribe());
      const res = await app.request("/articles/stream");
      expect(res.status).toBe(503);
      expect((await res.json()).detail).toBe("Too many SSE connections");
    } finally {
      for (const id of ids) articleBroker.unsubscribe(id);
    }
  });
});
