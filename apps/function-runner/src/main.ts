import * as http from 'node:http';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';
import { RunRequestBody, WorkerMessage } from './types';

const PORT = Number(process.env.PORT) || 3002;
const DEFAULT_TIMEOUT_MS = 10_000;

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

// One fresh worker_thread per invocation, never reused (scope.md §26 point 5) -- rules out any
// leftover global state from one invocation being observable by a later one, which matters most
// for the cross-project isolation property (§26 point 7). The timeout here is a backstop behind
// worker.terminate(): even a worker whose message never arrives (hung in a synchronous infinite
// loop, which can't be preempted from outside without terminate()) gets killed and this request
// still resolves.
function runFunction(body: RunRequestBody): Promise<{ status: number; payload: unknown }> {
  return new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'worker-entry.js'), {
      workerData: { code: body.code, ctx: body.ctx },
    });
    const timeoutMs = body.timeoutMs > 0 ? body.timeoutMs : DEFAULT_TIMEOUT_MS;

    let settled = false;
    const finish = (status: number, payload: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      void worker.terminate();
      resolve({ status, payload });
    };

    const timer = setTimeout(() => {
      finish(504, { error: 'Function execution timed out' });
    }, timeoutMs);

    worker.once('message', (message: WorkerMessage) => {
      if (message.ok) {
        finish(200, message.result);
      } else {
        finish(500, { error: message.error });
      }
    });

    worker.once('error', (err: Error) => {
      finish(500, { error: err.message });
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'POST' && req.url === '/run') {
    readJsonBody(req)
      .then(async (body) => {
        const parsed = body as Partial<RunRequestBody>;
        if (typeof parsed.code !== 'string' || !parsed.ctx) {
          sendJson(res, 400, { error: 'code and ctx are required' });
          return;
        }
        const { status, payload } = await runFunction(parsed as RunRequestBody);
        sendJson(res, status, payload);
      })
      .catch((err: Error) => {
        sendJson(res, 400, { error: err.message });
      });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`function-runner listening on :${PORT}`);
});
