import { ErrorHandler, NotFoundHandler } from "hono"
import { HTTPException } from "hono/http-exception"
import {
  defaultErrorResponse,
  ErrorResponse,
  invalidDataResponse,
  notFoundResponse,
} from "@/libs/error/ErrorResponses"
import { BackendError } from "@/libs/error/BackendError"

export const errorHandler: ErrorHandler = (error, c) => {
  const path = c.req.path

  const handleError = (errorResponse: ErrorResponse, errorMessage: string) => {
    console.error(`Error: ${path} - ${errorMessage}`)

    // The wrapper message alone rarely says why — print the underlying failure too
    const cause = error instanceof Error ? error.cause : undefined
    if (cause) console.error(cause)

    return c.json(errorResponse, errorResponse.httpStatus)
  }

  switch (true) {
    case error instanceof BackendError:
      return handleError(error.backendErrorResponse, error.internalMessage)

    case error instanceof HTTPException && error.status === 404:
      return handleError(notFoundResponse, error.message)

    case error instanceof HTTPException && error.status === 400:
      return handleError(invalidDataResponse, error.message)

    case error instanceof HTTPException:
      return handleError({ ...defaultErrorResponse, httpStatus: error.status }, error.message)

    default:
      return handleError(defaultErrorResponse, error.message)
  }
}

export const notFoundHandler: NotFoundHandler = (c) => {
  console.error(`Error: ${c.req.path} - not found`)
  return c.json(notFoundResponse, notFoundResponse.httpStatus)
}
