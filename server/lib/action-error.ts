import { fail } from "@agent-native/core/action";

export function actionFail(error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unexpected Alora action failure";
  return fail(message, { errorCode: "alora_error", statusCode: 400 });
}
