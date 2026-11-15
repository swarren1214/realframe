// Shared headless Chromium for thumbnails and page snapshots.

/** Blocks requests a prototype has no business making from our servers. */
export function privateHost(url: string) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol === "data:" || protocol === "blob:" || protocol === "about:")
      return false;
    if (protocol !== "https:" && protocol !== "http:") return true;
    return (
      hostname === "localhost" ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(
        hostname,
      )
    );
  } catch {
    return true;
  }
}

export async function browser() {
  const puppeteer = await import("puppeteer-core");
  const local = process.env.CHROME_EXECUTABLE_PATH;
  if (local)
    return puppeteer.launch({
      executablePath: local,
      headless: true,
      args: ["--no-sandbox"],
    });
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  });
}
