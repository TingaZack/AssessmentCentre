import * as React from 'react';
import * as Sentry from '@sentry/react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import type { UserProfile } from '../types/auth.types';

const ENABLED_ENVIRONMENTS = new Set(['production', 'staging']);
const DEFAULT_TRACES_SAMPLE_RATE = 0.1;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SENSITIVE_QUERY_PATTERN = /([?&](?:api[_-]?key|token|secret|password)=)[^&#\s]+/gi;

export const getFrontendSentryEnvironment = () =>
  import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || 'development';

export const isFrontendSentryEnabled = () =>
  Boolean(import.meta.env.VITE_SENTRY_DSN) &&
  ENABLED_ENVIRONMENTS.has(getFrontendSentryEnvironment());

const redactSensitiveText = (value: string) =>
  value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(SENSITIVE_QUERY_PATTERN, '$1[redacted]');

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
    event.request.url = event.request.url?.split('?')[0]?.split('#')[0];
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }

  return event;
};

// Docs: React options, router v7 tracing, and replay sampling:
// https://docs.sentry.io/platforms/javascript/configuration/environments/
// https://docs.sentry.io/platforms/javascript/guides/react/features/react-router/v7/
// https://docs.sentry.io/platforms/javascript/configuration/environments/#session-replay-options
export const initFrontendSentry = () => {
  if (!isFrontendSentryEnabled()) return;

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: getFrontendSentryEnvironment(),
    release: import.meta.env.VITE_SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  });
};

// Docs: setUser/setTag are the supported APIs for minimal event context.
// https://docs.sentry.io/platforms/javascript/apis/#setuser
export const syncSentryUser = (user: UserProfile | null) => {
  if (!isFrontendSentryEnabled()) return;

  if (!user) {
    Sentry.setUser(null);
    Sentry.setTag('role', 'anonymous');
    return;
  }

  Sentry.setUser({ id: user.uid });
  Sentry.setTag('role', user.role);
};

// Docs: React 19 root error hooks integrate through reactErrorHandler().
// https://docs.sentry.io/platforms/javascript/guides/react/features/error-boundary/#error-hooks-vs-errorboundary
export const reactRootErrorHandler = Sentry.reactErrorHandler();

export const withSentryReactRouterV7Routing =
  Sentry.withSentryReactRouterV7Routing;

export const captureReactBoundaryException = Sentry.captureReactException;
