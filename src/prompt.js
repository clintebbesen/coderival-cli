// @ts-check
// Ask for a secret on the terminal without echoing it.

/**
 * @param {string} question
 * @param {{ input?: NodeJS.ReadStream, output?: NodeJS.WriteStream }} [streams]
 * @returns {Promise<string>}
 */
export function askHidden(question, { input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) {
      reject(new Error("No terminal to ask for the token. Use --token-env NAME instead."));
      return;
    }
    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";
    /** @param {string} chunk */
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(value.trim());
          return;
        }
        if (char === "\u0003") {
          finish();
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    const finish = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };
    input.on("data", onData);
  });
}
