export async function readJsonOrThrow<T>(
  response: Response,
  failurePrefix: string,
): Promise<T> {
  const data = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error(apiErrorMessage(data, failurePrefix, response.status));
  }
  return data as T;
}

function apiErrorMessage(
  data: unknown,
  failurePrefix: string,
  status: number,
): string {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error
  ) {
    return data.error;
  }
  return `${failurePrefix} failed with ${status}`;
}
