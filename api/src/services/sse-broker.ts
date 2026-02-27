import { EventEmitter } from "node:events";

const CLIENT_QUEUE_MAXSIZE = 64;
const MAX_SSE_CONNECTIONS = 20;

export class ConnectionLimitExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionLimitExceeded";
  }
}

interface ClientQueue {
  id: number;
  events: Record<string, unknown>[];
  resolve: ((value: Record<string, unknown>) => void) | null;
}

export class SSEBroker {
  private clients = new Map<number, ClientQueue>();
  private nextId = 0;
  private emitter = new EventEmitter();

  subscribe(): number {
    if (this.clients.size >= MAX_SSE_CONNECTIONS) {
      throw new ConnectionLimitExceeded(
        `Maximum SSE connections (${MAX_SSE_CONNECTIONS}) exceeded`,
      );
    }
    const id = this.nextId++;
    this.clients.set(id, { id, events: [], resolve: null });
    return id;
  }

  unsubscribe(clientId: number): void {
    this.clients.delete(clientId);
  }

  async broadcast(event: Record<string, unknown>): Promise<void> {
    for (const [, client] of this.clients) {
      if (client.resolve) {
        // Client is waiting for an event
        const resolve = client.resolve;
        client.resolve = null;
        resolve(event);
      } else if (client.events.length < CLIENT_QUEUE_MAXSIZE) {
        client.events.push(event);
      } else {
        console.warn("SSE client queue full, dropping event");
      }
    }
  }

  async waitForEvent(clientId: number, timeoutMs = 1000): Promise<Record<string, unknown> | null> {
    const client = this.clients.get(clientId);
    if (!client) return null;

    // Check buffered events first
    if (client.events.length > 0) {
      return client.events.shift()!;
    }

    // Wait for next event
    return new Promise<Record<string, unknown> | null>((resolve) => {
      const timer = setTimeout(() => {
        client.resolve = null;
        resolve(null);
      }, timeoutMs);

      client.resolve = (event) => {
        clearTimeout(timer);
        resolve(event);
      };
    });
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const articleBroker = new SSEBroker();
