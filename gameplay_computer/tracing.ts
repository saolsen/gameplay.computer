import "https://deno.land/x/xhr@0.1.0/mod.ts";
import "node:async_hooks";
import {
  context,
  propagation,
  Span,
  SpanStatusCode,
  trace as otelTrace,
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
import { Client, InStatement, ResultSet, TransactionMode } from "libsql/client";

export function getTracer(): Tracer {
  return otelTrace.getTracer("gameplay");
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
      }),
    ),
  );

  provider.register({
    contextManager: new AsyncLocalStorageContextManager(),
    propagator: new B3Propagator(),
  });
}

export const tracingMiddleware: MiddlewareHandler = async (
  c,
  next,
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
    },
  );
};

export function traced<
  // deno-lint-ignore no-explicit-any
  F extends (...args: any[]) => any,
>(name: string, f: F) {
  return async function (
    ...args: Parameters<F>
  ): Promise<Awaited<ReturnType<F>>> {
    return await traceAsync(name, f, ...args);
  };
}

export function traceAsync<
  // deno-lint-ignore no-explicit-any
  F extends (...args: any[]) => any,
>(
  name: string,
  fn: F,
  ...args: Parameters<F>
): Promise<Awaited<ReturnType<F>>> {
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

export function trace<
  // deno-lint-ignore no-explicit-any
  F extends (...args: any[]) => any,
>(name: string, fn: F, ...args: Parameters<F>): ReturnType<F> {
  return getTracer().startActiveSpan(name, (span: Span) => {
    try {
      const result = fn(...args);
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

function tracedExecute(client: Client) {
  return async function execute(statement: InStatement): Promise<ResultSet> {
    return await getTracer().startActiveSpan(`sqlite:execute`, async (span) => {
      if (typeof statement === "string") {
        span.addEvent("sqlite.execute", {
          "sqlite.statement": statement,
        });
      } else {
        const kind = statement.sql.split(" ")[0];
        span.addEvent("sqlite.execute " + kind, {
          "sqlite.statement": statement.sql,
          "sqlite.args": JSON.stringify(statement.args, null, 2),
        });
      }
      try {
        const result = await client.execute(statement);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw new Error(error);
      } finally {
        span.end();
      }
    });
  };
}

function tracedBatch(client: Client) {
  return async function batch(
    statements: InStatement[],
    mode?: TransactionMode,
  ): Promise<ResultSet[]> {
    return await getTracer().startActiveSpan(`sqlite:batch`, async (span) => {
      for (const statement of statements) {
        if (typeof statement === "string") {
          span.addEvent("sqlite.batch", {
            statement: statement,
          });
        } else {
          const kind = statement.sql.split(" ")[0];
          span.addEvent("sqlite.batch " + kind, {
            "sqlite.statement": statement.sql,
            "sqlite.args": JSON.stringify(statement.args, null, 2),
          });
        }
      }
      try {
        const result = await client.batch(statements, mode);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw new Error(error);
      } finally {
        span.end();
      }
    });
  };
}

export function tracedDbClient(client: Client): Client {
  return {
    ...client,
    execute: tracedExecute(client),
    batch: tracedBatch(client),
  };
}
