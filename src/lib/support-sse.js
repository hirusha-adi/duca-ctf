export function createSseResponse(request, onSubscribe) {
  let cleanup = () => {};

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      send({ type: "connected" });
      cleanup = (await onSubscribe(send)) || (() => {});

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        cleanup();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
