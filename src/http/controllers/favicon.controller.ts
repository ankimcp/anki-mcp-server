import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Controller,
  Get,
  Header,
  Logger,
  NotFoundException,
  Param,
  StreamableFile,
} from "@nestjs/common";

/**
 * Serves favicon assets to browsers over HTTP.
 *
 * Registered only by `AppModule.forHttp()` — STDIO mode has no HTTP surface.
 *
 * Design:
 * - Allowlist of canonical `<route> → { filename, mimeType }` entries is the
 *   single source of truth. Requests that don't match the allowlist 404.
 *   No user input is ever joined into a filesystem path.
 * - Assets are eager-loaded into an in-memory `Map<route, Buffer>` at
 *   construction. Favicons are tiny, constant, and read frequently — the
 *   serve path stays simple (constructor owns I/O, handler owns response).
 * - Route paths deliberately have no base prefix so they land at the site
 *   root (`/favicon.ico`, etc.), which is where browsers look for them.
 */

interface FaviconAsset {
  readonly filename: string;
  readonly mimeType: string;
}

const FAVICON_SIZES = [16, 32, 48, 64, 96, 128, 192, 256, 512] as const;
type FaviconSize = (typeof FAVICON_SIZES)[number];

function isFaviconSize(value: number): value is FaviconSize {
  return (FAVICON_SIZES as readonly number[]).includes(value);
}

/**
 * Allowlist of routes this controller serves, mapped to the source file on
 * disk and the Content-Type to advertise. Keys are the route path segments
 * (without leading slash) that the `@Get(...)` decorators match.
 */
const FAVICON_ASSETS: Readonly<Record<string, FaviconAsset>> = {
  "favicon.ico": { filename: "favicon.ico", mimeType: "image/x-icon" },
  ...Object.fromEntries(
    FAVICON_SIZES.map((size) => [
      `favicon-${size}.png`,
      {
        filename: `favicon-${size}.png`,
        mimeType: "image/png",
      } satisfies FaviconAsset,
    ]),
  ),
};

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

@Controller()
export class FaviconController {
  private readonly logger = new Logger(FaviconController.name);
  private readonly cache = new Map<string, Buffer>();

  constructor() {
    const assetsDir = join(__dirname, "..", "..", "assets", "favicons");

    for (const [route, asset] of Object.entries(FAVICON_ASSETS)) {
      const absolutePath = join(assetsDir, asset.filename);
      try {
        this.cache.set(route, readFileSync(absolutePath));
      } catch (err) {
        // Missing asset during boot is not fatal — the route will 404. But
        // log a warning so it's obvious in dev if the build forgot to copy
        // the assets directory.
        this.logger.warn(
          `Favicon asset missing: ${absolutePath} (${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }

    this.logger.log(`Loaded ${this.cache.size} favicon assets`);
  }

  @Get("favicon.ico")
  @Header("Cache-Control", `public, max-age=${ONE_WEEK_SECONDS}`)
  getFaviconIco(): StreamableFile {
    return this.serve("favicon.ico");
  }

  @Get("favicon-:size.png")
  @Header("Cache-Control", `public, max-age=${ONE_WEEK_SECONDS}`)
  getFaviconSized(@Param("size") sizeParam: string): StreamableFile {
    const size = Number.parseInt(sizeParam, 10);
    if (!Number.isFinite(size) || !isFaviconSize(size)) {
      throw new NotFoundException();
    }
    return this.serve(`favicon-${size}.png`);
  }

  private serve(route: string): StreamableFile {
    const asset = FAVICON_ASSETS[route];
    const buffer = this.cache.get(route);
    if (!asset || !buffer) {
      throw new NotFoundException();
    }
    return new StreamableFile(buffer, {
      type: asset.mimeType,
      length: buffer.byteLength,
    });
  }
}
