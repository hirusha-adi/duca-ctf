import * as Sentry from "@sentry/nextjs";
import { initBugsink } from "./lib/bugsink";

initBugsink();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
