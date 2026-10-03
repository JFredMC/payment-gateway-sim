import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedWebhook {
  headers: IncomingHttpHeaders;
  rawBody: string;
  body: { id: string; type: string; data: { object: Record<string, unknown> } };
}

/** A merchant's webhook endpoint for tests: records requests, answers as told. */
export class WebhookReceiver {
  readonly received: ReceivedWebhook[] = [];
  status = 200;
  delayMs = 0;
  private server: Server | null = null;
  url = '';

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        this.received.push({
          headers: req.headers,
          rawBody,
          body: JSON.parse(rawBody) as ReceivedWebhook['body'],
        });
        setTimeout(() => {
          res.writeHead(this.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true, status: this.status }));
        }, this.delayMs);
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}/webhooks`;
    return this;
  }

  reset(): void {
    this.received.length = 0;
    this.status = 200;
    this.delayMs = 0;
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) =>
      this.server ? this.server.close(() => resolve()) : resolve(),
    );
  }
}
