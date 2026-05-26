import * as Sentry from "@sentry/node";

type FirebaseHandler = (...args: never[]) => unknown;

interface ReportContext {
  functionName?: string;
  trigger?: string;
  statusCode?: number;
}

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const ENABLED_ENVIRONMENTS = new Set(["production", "staging"]);
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SENSITIVE_QUERY_PATTERN = /([?&](?:api[_-]?key|token|secret|password)=)[^&#\s]+/gi;
const EXPECTED_HTTPS_ERROR_CODES = new Set([
  "already-exists",
  "cancelled",
  "failed-precondition",
  "invalid-argument",
  "not-found",
  "out-of-range",
  "permission-denied",
  "unauthenticated",
]);

let initialized = false;

const getEnvironment = () =>
  process.env.SENTRY_ENVIRONMENT ||
  process.env.NODE_ENV ||
  (process.env.FUNCTIONS_EMULATOR === "true" ? "development" : "production");

const getTraceSampleRate = () => {
  const parsed = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(parsed) ? parsed : DEFAULT_TRACES_SAMPLE_RATE;
};

const isEnabled = () =>
  Boolean(process.env.SENTRY_FUNCTIONS_DSN) &&
  ENABLED_ENVIRONMENTS.has(getEnvironment());

const redactSensitiveText = (value: string) =>
  value
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(SENSITIVE_QUERY_PATTERN, "$1[redacted]");

const scrubEvent = <TEvent extends Sentry.Event>(event: TEvent) => {
  const userId = event.user?.id;
  event.user = userId ? { id: userId } : undefined;

  if (event.message) {
    event.message = redactSensitiveText(event.message);
  }

  for (const exception of event.exception?.values || []) {
    if (exception.value) {
      exception.value = redactSensitiveText(exception.value);
    }
  }

  for (const breadcrumb of event.breadcrumbs || []) {
    if (breadcrumb.message) {
      breadcrumb.message = redactSensitiveText(breadcrumb.message);
    }
  }

  if (event.request) {
    event.request.url = event.request.url?.split("?")[0]?.split("#")[0];
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
    delete event.request.query_string;
  }

  return event;
};

// Docs: Node SDK init options and environment/release fields.
// https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/
export const initFunctionsSentry = () => {
  if (initialized || !isEnabled()) return;

  Sentry.init({
    dsn: process.env.SENTRY_FUNCTIONS_DSN,
    environment: getEnvironment(),
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: getTraceSampleRate(),
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  });

  initialized = true;
};

const getHttpsErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
};

const shouldReportError = (error: unknown) => {
  const code = getHttpsErrorCode(error);
  return !code || !EXPECTED_HTTPS_ERROR_CODES.has(code);
};

const getRuntimeFunctionName = (fallback: string) =>
  process.env.FUNCTION_TARGET || process.env.K_SERVICE || fallback;

const getRoleFromToken = (token: unknown) => {
  if (!token || typeof token !== "object") return "";
  const claims = token as Record<string, unknown>;
  const role = claims.role || claims.userRole || claims.user_role;
  return typeof role === "string" ? role : "";
};

const applyCallableAuthContext = (scope: Sentry.Scope, args: unknown[]) => {
  const request = args[0] as
    | { auth?: { uid?: string; token?: unknown } }
    | undefined;

  if (!request?.auth?.uid) return;

  scope.setUser({ id: request.auth.uid });

  const role = getRoleFromToken(request.auth.token);
  if (role) scope.setTag("role", role);
};

const getResponseStatusCode = (args: unknown[]) => {
  for (const arg of args) {
    if (!arg || typeof arg !== "object") continue;
    const statusCode = (arg as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number") return statusCode;
  }

  return undefined;
};

// Docs: Firebase Functions do not currently have automatic Sentry wrapping in
// this app shape, so failures are captured manually, flushed, then rethrown.
// https://sentry.zendesk.com/hc/en-us/articles/34312308904347-Can-I-monitor-my-Cloud-Functions-with-Sentry
export const reportFunctionError = async (
  error: unknown,
  context: ReportContext = {},
) => {
  if (!isEnabled() || !shouldReportError(error)) return undefined;

  let eventId: string | undefined;
  Sentry.withScope((scope) => {
    if (context.functionName) {
      scope.setTag("firebase.function", context.functionName);
    }
    if (context.trigger) {
      scope.setTag("firebase.trigger", context.trigger);
    }
    if (context.statusCode) {
      scope.setTag("http.status_code", String(context.statusCode));
    }

    eventId = Sentry.captureException(error);
  });

  await Sentry.flush(2000);
  return eventId;
};

// Docs: manual capture + flush keeps Firebase failures visible to Sentry while
// preserving Firebase's own retry/failure semantics by rethrowing.
// https://sentry.zendesk.com/hc/en-us/articles/34312308904347-Can-I-monitor-my-Cloud-Functions-with-Sentry
export const withSentryFunction = <THandler extends FirebaseHandler>(
  trigger: string,
  handler: THandler,
): THandler => {
  const wrapped = async (...args: Parameters<THandler>) =>
    Sentry.withIsolationScope(async (scope) => {
      const functionName = getRuntimeFunctionName(trigger);

      scope.setTag("firebase.function", functionName);
      scope.setTag("firebase.trigger", trigger);
      applyCallableAuthContext(scope, args);

      try {
        const result = await Sentry.startSpan(
          {
            name: functionName,
            op: `firebase.${trigger}`,
          },
          () => handler(...args),
        );
        const statusCode = getResponseStatusCode(args);

        if (typeof statusCode === "number" && statusCode >= 500) {
          await reportFunctionError(
            new Error(`Handled HTTP ${statusCode} response from ${functionName}`),
            { functionName, trigger, statusCode },
          );
        }

        return result;
      } catch (error) {
        await reportFunctionError(error, { functionName, trigger });
        throw error;
      }
    });

  return wrapped as THandler;
};

export const wrapFirebaseHandlerFactory = <TFactory extends FirebaseHandler>(
  factory: TFactory,
  trigger: string,
): TFactory => {
  const wrappedFactory = (...args: Parameters<TFactory>) => {
    const wrappedArgs = [...args];

    for (let index = wrappedArgs.length - 1; index >= 0; index -= 1) {
      if (typeof wrappedArgs[index] === "function") {
        wrappedArgs[index] = withSentryFunction(
          trigger,
          wrappedArgs[index] as FirebaseHandler,
        ) as Parameters<TFactory>[number];
        break;
      }
    }

    return factory(...wrappedArgs);
  };

  return wrappedFactory as TFactory;
};
