import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchJson, fetchText, HttpError, TimeoutError, timeoutMs, userAgent } from "@/lib/http";

let server: http.Server;
let base: string;
let lastUserAgent: string | undefined;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastUserAgent = req.headers["user-agent"];
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/snel") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ hallo: "wereld" }));
    }
    if (url.pathname === "/traag") {
      // Headers zijn er meteen, de body pas veel later.
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("begin");
      return setTimeout(() => res.end("einde"), 3_000);
    }
    if (url.pathname === "/geen-json") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end("<html>oeps</html>");
    }
    res.writeHead(404).end("weg");
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("timeoutMs", () => {
  it("valt terug op de standaard bij een lege variabele", () => {
    process.env.FETCH_TIMEOUT_MS = "";
    expect(timeoutMs()).toBe(12_000);

    // Dit was de bug: 0 werd letterlijk overgenomen en brak elke request af.
    process.env.FETCH_TIMEOUT_MS = "0";
    expect(timeoutMs()).toBe(1_000);

    delete process.env.FETCH_TIMEOUT_MS;
    expect(timeoutMs()).toBe(12_000);
  });
});

describe("userAgent", () => {
  it("gebruikt nooit een lege user-agent", async () => {
    process.env.SCRAPER_USER_AGENT = "";
    expect(userAgent()).toContain("wagyu-aanbieding");

    await fetchJson(`${base}/snel`);
    expect(lastUserAgent).toContain("wagyu-aanbieding");
    delete process.env.SCRAPER_USER_AGENT;
  });
});

describe("fetch met timeout", () => {
  it("haalt een snel antwoord gewoon op", async () => {
    await expect(fetchJson(`${base}/snel`)).resolves.toEqual({ hallo: "wereld" });
  });

  it("breekt af met een leesbare melding, ook als alleen de body traag is", async () => {
    process.env.FETCH_TIMEOUT_MS = "1000";
    try {
      await expect(fetchText(`${base}/traag`)).rejects.toThrow(TimeoutError);
      await expect(fetchText(`${base}/traag`)).rejects.toThrow(/timeout na 1000 ms/);
    } finally {
      delete process.env.FETCH_TIMEOUT_MS;
    }
  }, 10_000);

  it("meldt een HTTP-fout met status en url", async () => {
    await expect(fetchText(`${base}/bestaat-niet`)).rejects.toThrow(HttpError);
    await expect(fetchText(`${base}/bestaat-niet`)).rejects.toThrow(/HTTP 404/);
  });

  it("meldt het als er geen JSON terugkomt", async () => {
    await expect(fetchJson(`${base}/geen-json`)).rejects.toThrow(/geen geldige JSON/);
  });
});
