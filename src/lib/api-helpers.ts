/**
 * Shared plumbing for every `/api/flashcards*` handler: turns unexpected
 * failures into the same `ApiErrorResponse` JSON shape used everywhere
 * else, instead of letting them fall through as raw unhandled exceptions.
 * This is the app's first JSON API, so the precedent set here carries into
 * future routes too.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import type { ApiErrorResponse } from "@/types";

/** An error with an explicit HTTP status, mapped by `withApiErrorHandling`. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function jsonError(message: string, status: number): Response {
  const body: ApiErrorResponse = { error: message };
  return Response.json(body, { status });
}

/**
 * Validates a route `id` path param as a UUID.
 * Throws an `ApiError` (mapped to `400` by `withApiErrorHandling`) on failure.
 */
export function parseIdParam(id: string | undefined): string {
  const result = z.uuid().safeParse(id);
  if (!result.success) {
    throw new ApiError("Invalid id", 400);
  }
  return result.data;
}

/**
 * Wraps an `APIRoute` handler so an uncaught throw becomes a `500`
 * `ApiErrorResponse` instead of an unhandled exception, and an `ApiError`
 * thrown by the handler (e.g. from `parseIdParam`) maps to its own status.
 */
export function withApiErrorHandling(handler: APIRoute): APIRoute {
  return async (context) => {
    try {
      return await handler(context);
    } catch (err) {
      if (err instanceof ApiError) {
        return jsonError(err.message, err.status);
      }
      console.error(err);
      return jsonError("Internal server error", 500);
    }
  };
}
