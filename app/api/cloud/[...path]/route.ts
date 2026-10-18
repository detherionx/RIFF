import { NextRequest } from "next/server";

const methods: Record<string, string[]> = {
  sessions: ["POST"],
  progress: ["GET", "PUT"],
  account: ["DELETE"],
};
const limit = 1_048_576;
const failure = (detail: string, status: number, headers = {}) =>
  Response.json(
    { detail },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
    if (process.env.PUBLIC_ORIGIN)
      return origin === new URL(process.env.PUBLIC_ORIGIN).origin;
    // Host remains the public host behind Railway; never trust client-supplied forwarded headers.
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    return (
      parsed.host === request.headers.get("host") &&
      (parsed.protocol === "https:" ||
        (parsed.protocol === "http:" &&
          (local || process.env.NODE_ENV !== "production")))
    );
  } catch {
    return false;
  }
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.length !== 1 || !Object.hasOwn(methods, path[0]))
    return failure("Not found", 404);
  if (!methods[path[0]].includes(request.method))
    return failure("Method not allowed", 405, {
      Allow: methods[path[0]].join(", "),
    });
  const base = process.env.RIFF_API_URL;
  if (!base)
    return failure(
      "Cloud backup is not configured. Your local practice still works.",
      503,
    );
  if (request.method !== "GET" && !sameOrigin(request))
    return failure("Origin not allowed", 403);
  try {
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (request.method === "PUT") {
      if (
        request.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "application/json"
      )
        return failure("Use application/json", 415);
      if (Number(request.headers.get("content-length")) > limit)
        return failure("Progress exceeds 1 MiB", 413);
      const reader = request.body?.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) {
            await reader.cancel();
            return failure("Progress exceeds 1 MiB", 413);
          }
          chunks.push(value);
        }
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    const authorization = request.headers.get("authorization");
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/${path[0]}`, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    return new Response(response.status === 204 ? null : response.body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(response.headers.get("retry-after")
          ? { "Retry-After": response.headers.get("retry-after")! }
          : {}),
      },
    });
  } catch {
    return failure(
      "Backup service is unavailable. Your progress is still saved on this device.",
      502,
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
