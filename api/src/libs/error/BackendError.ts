import {
  defaultErrorResponse,
  ErrorResponse,
} from "@/libs/error/ErrorResponses";

export class BackendError extends Error {
  public backendErrorResponse = defaultErrorResponse;

  /**
   * `cause` is what makes a wrapped failure debuggable: the handler logs it and
   * Sentry chains it onto the report. Without it, a route that catches an
   * upstream error and rethrows its own message throws the real reason away,
   * and the log says only what we already knew.
   */
  constructor(
    public internalMessage: string,
    backendErrorResponse?: ErrorResponse,
    options?: { cause?: unknown }
  ) {
    super(internalMessage, options);
    if (backendErrorResponse) {
      this.backendErrorResponse = backendErrorResponse;
    }
  }
}
