import { type ErrorCodec, errorMessage } from "@parity-app/channel"
import { CodedError, errorDetails, readErrorDetails } from "@parity-app/core"

/**
 * Failures with core's coded details, both ways: a `CodedError` is sent with its details, and details that arrive are
 * checked before they make one.
 */
export const codedErrors: ErrorCodec = {
  encode(error) {
    const details = errorDetails(error)
    const encoded: ReturnType<ErrorCodec["encode"]> = { error: errorMessage(error) }

    if (details) {
      encoded.details = details
    }

    return encoded
  },
  decode(message, details) {
    const read = readErrorDetails(details)

    return read ? new CodedError(message, read) : new Error(message)
  }
}
