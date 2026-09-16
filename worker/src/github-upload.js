import { Buffer } from 'node:buffer';

// Keep only a network chunk and up to two carry bytes in memory. The JSON
// terminator is emitted only after the complete, declared file has arrived.
export function createGitHubUploadBody(source, bytes, metadata) {
  const encoder = new TextEncoder();
  const reader = source.getReader();
  let received = 0;
  let carry = Buffer.alloc(0);
  let failure;
  let complete = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify(metadata).slice(0, -1) + ',"content":"'));
    },
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (received !== bytes) throw new Error('Video upload size does not match the selected file.');
            controller.enqueue(encoder.encode(carry.toString('base64') + '"}'));
            complete = true;
            controller.close();
            reader.releaseLock();
            return;
          }
          received += value.byteLength;
          if (received > bytes) throw new Error('Video upload exceeds the declared file size.');
          const chunk = Buffer.concat([carry, value]);
          const alignedLength = chunk.length - chunk.length % 3;
          // Copy the carry so it cannot keep a large input buffer alive.
          carry = Buffer.from(chunk.subarray(alignedLength));
          if (alignedLength) {
            controller.enqueue(encoder.encode(chunk.subarray(0, alignedLength).toString('base64')));
            return;
          }
        }
      } catch (error) {
        failure = error;
        controller.error(error);
        await reader.cancel(error).catch(() => {});
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => {});
    }
  });
  return {
    body,
    get complete() { return complete; },
    get error() { return failure; },
    async cancel() { if (!complete) await reader.cancel().catch(() => {}); }
  };
}
