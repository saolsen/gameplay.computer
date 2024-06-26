import "https://deno.land/x/xhr@0.1.0/mod.ts";
import "async_hooks";
import {
  context,
  propagation,
  Span,
  SpanStatusCode,
  trace as otelTrace,
  Tracer,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { B3Propagator } from "@opentelemetry/propagator-b3";
import { Resource } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from "@opentelemetry/sdk-trace-web";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  Config,
  InStatement,
  ResultSet,
  TransactionMode,
} from "@libsql/client";
import { HttpClient } from "@libsql/client/http";
import { expandConfig } from "@libsql/core/config";
import { encodeBaseUrl } from "@libsql/core/uri";
import { MiddlewareHandler } from "hono";

export function tracer(): Tracer {
  return otelTrace.getTracer("gameplay");
}

export function attribute(name: string, value: string): void {
  otelTrace.getActiveSpan()?.setAttribute(name, value);
}

export function event(name: string, attrs: Record<string, string>): void {
  otelTrace.getActiveSpan()?.addEvent(name, attrs);
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
    new BatchSpanProcessor(
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
  await tracer().startActiveSpan(
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
          console.error(c.error);
        }
      }
      span.end();
    },
  );
};

export async function traceTask<
  // deno-lint-ignore no-explicit-any
  F extends (...args: any[]) => any,
>(
  kind: string,
  b3: string,
  fn: F,
  ...args: Parameters<F>
): Promise<Awaited<ReturnType<F>>> {
  const active_context = propagation.extract(context.active(), {
    b3,
  });
  return await tracer().startActiveSpan(
    `Task: ${kind}`,
    {},
    active_context!,
    async (span: Span) => {
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
    },
  );
}

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
  return tracer().startActiveSpan(name, async (span: Span) => {
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
  return tracer().startActiveSpan(name, (span: Span) => {
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

export function getPropB3(): string {
  const prop_output: { b3: string } = { b3: "" };
  propagation.inject(context.active(), prop_output);
  return prop_output.b3;
}

export async function tracedFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  return await tracer().startActiveSpan(`fetch`, async (span) => {
    const b3 = getPropB3();
    try {
      const resp: Response = await fetch(input + "/", {
        ...init,
        headers: {
          b3,
          ...(init?.headers ?? {}),
        },
      });
      span.setAttributes({
        "http.url": resp.url,
        "response.status_code": resp.status,
      });
      if (resp.ok && resp.status >= 200 && resp.status < 400) {
        span.setStatus({ code: SpanStatusCode.OK });
      } else {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: await resp.clone().text(),
        });
      }
      return resp;
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

export class TracedClient extends HttpClient {
  constructor(config: Config) {
    const expanded = expandConfig(config, true);
    const url = encodeBaseUrl(
      expanded.scheme,
      expanded.authority,
      expanded.path,
    );
    super(url, expanded.authToken, expanded.intMode, expanded.fetch);
  }

  async batch(
    statements: InStatement[],
    mode?: TransactionMode,
  ): Promise<ResultSet[]> {
    return await tracer().startActiveSpan(`sqlite:batch`, async (span) => {
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
        const result = await super.batch(statements, mode);
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

  async execute(statement: InStatement): Promise<ResultSet> {
    return await tracer().startActiveSpan(
      `sqlite:execute`,
      async (span) => {
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
          const result = await super.execute(statement);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);
          throw new error();
        } finally {
          span.end();
        }
      },
    );
  }
}
