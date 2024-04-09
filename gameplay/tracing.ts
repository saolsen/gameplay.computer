import "https://deno.land/x/xhr@0.1.0/mod.ts";
import "node:async_hooks";
import {
  context,
  propagation,
  Span,
  SpanStatusCode,
  trace,
  Tracer,
} from "npm:@opentelemetry/api";
import { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-http";
import { B3Propagator } from "npm:@opentelemetry/propagator-b3";
import { Resource } from "npm:@opentelemetry/resources";
import {
  SimpleSpanProcessor,
  WebTracerProvider,
} from "npm:@opentelemetry/sdk-trace-web";
import { SEMRESATTRS_SERVICE_NAME } from "npm:@opentelemetry/semantic-conventions";
import { AsyncLocalStorageContextManager } from "npm:@opentelemetry/context-async-hooks";
import { MiddlewareHandler } from "hono";

export function getTracer(): Tracer {
  return trace.getTracer("gameplay");
}

/**
 * Initializes opentelemetry tracing.
 */
export function setupTracing(honeycomb_api_key: string): void {
  const provider = new WebTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: "gameplay",
    }),
  });

  // Send traces to honeycomb.
  provider.addSpanProcessor(
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: "https://api.honeycomb.io/v1/traces",
        headers: {
          "x-honeycomb-team": honeycomb_api_key,
        },
      })
    )
  );

  provider.register({
    contextManager: new AsyncLocalStorageContextManager(),
    propagator: new B3Propagator(),
  });
}

export const tracingMiddleware: MiddlewareHandler = async (
  c,
  next
): Promise<void | Response> => {
  let active_context = null;
  const prop_header = c.req.header("b3");
  if (prop_header) {
    active_context = propagation.extract(context.active(), {
      b3: prop_header,
    });
  }
  await getTracer().startActiveSpan(
    `${c.req.method} ${c.req.url}`,
    {},
    active_context!,
    async (span) => {
      await next();
      span.setAttributes({
        "http.method": c.req.method,
        "http.url": c.req.url,
        "response.status_code": c.res.status,
      });
      const user = c.get("user");
      if (user) {
        span.setAttributes({
          user_id: user.id,
          user_username: user.username,
          user_email_address: user.email_address,
        });
      }
      if (c.res.ok && c.res.status >= 200 && c.res.status < 500) {
        span.setStatus({ code: SpanStatusCode.OK });
      } else {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: c.error?.message ?? "Unknown error",
        });
        if (c.error) {
          span.recordException(c.error);
        }
      }
      span.end();
    }
  );
};

export function tracedPromise<
  T,
  // deno-lint-ignore no-explicit-any
  F extends (...args: any[]) => Promise<T>
>(name: string, fn: F, ...args: Parameters<F>): Promise<T> {
  return getTracer().startActiveSpan(name, async (span: Span) => {
    try {
      const result = await fn(...args);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}
