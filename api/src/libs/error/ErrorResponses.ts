import { z } from "@hono/zod-openapi"
import { ContentfulStatusCode } from "hono/utils/http-status"
import { ErrorResponseSchema, ErrorResponseCode } from "@/libs/error/ErrorResponseSchema"

export type ErrorResponse = z.infer<typeof ErrorResponseSchema> & {
  httpStatus: ContentfulStatusCode
}

export const defaultErrorResponse: ErrorResponse = {
  errorCode: "GENERAL_ERROR",
  errorMessage: "Something went wrong",
  httpStatus: 500,
  ok: false,
}

export const invalidDataResponse: ErrorResponse = {
  ...defaultErrorResponse,
  errorCode: ErrorResponseCode.enum.INVALID_DATA,
  errorMessage: "invalid data",
  httpStatus: 400,
}

export const notFoundResponse: ErrorResponse = {
  ...defaultErrorResponse,
  errorCode: ErrorResponseCode.enum.NOT_FOUND,
  errorMessage: "Not found",
  httpStatus: 404,
}

export const rateLimitedResponse: ErrorResponse = {
  ...defaultErrorResponse,
  errorCode: ErrorResponseCode.enum.RATE_LIMITED,
  errorMessage: "För många frågor på kort tid. Vänta en stund och försök igen.",
  httpStatus: 429,
}

export const modelNotConfiguredResponse: ErrorResponse = {
  ...defaultErrorResponse,
  errorCode: ErrorResponseCode.enum.MODEL_NOT_CONFIGURED,
  errorMessage: "Tjänsten är inte konfigurerad ännu (saknar AI-leverantör).",
  httpStatus: 503,
}
