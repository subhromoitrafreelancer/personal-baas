import { Controller, Get, Header } from '@nestjs/common';
import * as client from 'prom-client';

@Controller('metrics')
export class MetricsController {
  private static defaultMetricsStarted = false;

  constructor() {
    // Guard against double-registration: Nest can instantiate a controller more than once in
    // some test/module-reload scenarios, and collectDefaultMetrics() throws on the registry if
    // called twice.
    if (!MetricsController.defaultMetricsStarted) {
      client.collectDefaultMetrics();
      MetricsController.defaultMetricsStarted = true;
    }
  }

  // Deliberately not routed through Caddy (see docker-compose.yml/README) — reachable only on
  // the control-server's own port, for a Prometheus server running inside the same docker
  // network to scrape directly.
  @Get()
  @Header('Content-Type', client.register.contentType)
  async metrics(): Promise<string> {
    return client.register.metrics();
  }
}
