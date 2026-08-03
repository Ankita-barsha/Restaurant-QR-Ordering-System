/**
 * Composes the printable QR poster that a table's "Download QR Code" button
 * hands over.
 *
 * The server renders a bare QR PNG — correct for the screen, and correct as the
 * source of truth, since anything drawn around it must never alter the modules
 * themselves. The framing (restaurant name, table number, MONK DEVELOPER
 * footer) is therefore added here, at download time only: the admin preview and
 * every other consumer of /tables/:id/qr.png keep seeing the plain code.
 *
 * The card is dark because the printed table tent sits in a dimly lit room, but
 * the QR keeps its own white panel and quiet zone. Inverting a QR (light modules
 * on dark) is legal in the spec yet a good number of phone cameras refuse it, so
 * the code is left black-on-white and the black is spent on the surround.
 */

const WIDTH = 1080;
const HEIGHT = 1500;

const OBSIDIAN = "#0a0a0b";
const GOLD = "#c9a961";
const GOLD_DEEP = "#8f7434";
const IVORY = "#faf8f5";
const IVORY_FAINT = "#c9c4b8";

const DISPLAY = '"Cormorant Garamond Variable", Georgia, serif';
const BODY = '"Jost Variable", ui-sans-serif, system-ui, sans-serif';

export interface QrPosterInput {
  /** Object URL of the QR PNG already fetched for the preview. */
  qrSrc: string;
  restaurantName: string;
  tableNumber: string;
  logoSrc?: string | null;
}

/**
 * Waits for the bundled webfonts before measuring anything.
 *
 * Canvas silently substitutes a system font for one that has not loaded, and
 * because the poster is generated in a single pass there is no reflow to fix it
 * afterwards — the downloaded PNG would just be wrong.
 */
const ensureFonts = async (): Promise<void> => {
  if (!("fonts" in document)) return;

  await Promise.all([
    document.fonts.load(`600 96px ${DISPLAY}`),
    document.fonts.load(`700 40px ${BODY}`),
    document.fonts.load(`500 26px ${BODY}`),
  ]);

  await document.fonts.ready;
};

const loadImage = async (src: string): Promise<HTMLImageElement | null> => {
  try {
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      return await new Promise((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });
    }

    const response = await fetch(src, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = objectUrl;
    });
  } catch {
    return null;
  }
};

/**
 * Largest size at which `text` still fits `maxWidth`.
 *
 * Restaurant names run from "Ora" to "The Bombay Canteen & Dining Room", and a
 * name that overflows the card is worse than one set a few points smaller.
 */
const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  maxWidth: number,
  startSize: number,
  minSize: number
): number => {
  let size = startSize;

  while (size > minSize) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }

  return size;
};

/**
 * `letterSpacing` is a recent addition to the 2D context. Setting it through a
 * guard keeps older engines rendering an unspaced — but complete — poster
 * rather than throwing halfway through the draw.
 */
const setTracking = (ctx: CanvasRenderingContext2D, value: string): void => {
  if ("letterSpacing" in ctx) ctx.letterSpacing = value;
};

/** True once tracking has actually been applied by the engine. */
const trackingOf = (ctx: CanvasRenderingContext2D): number =>
  "letterSpacing" in ctx ? parseFloat(ctx.letterSpacing) || 0 : 0;

/**
 * Centres tracked text properly.
 *
 * Letter spacing is added after every glyph including the last, so the run
 * measures half a space wider on the right than it looks — centring on the raw
 * width leaves the words visibly off-axis against a symmetric border. Shifting
 * back by half the tracking puts the ink, not the advance, in the middle.
 */
const fillCentred = (
  ctx: CanvasRenderingContext2D,
  text: string,
  centreX: number,
  y: number
): void => {
  ctx.fillText(text, centreX - trackingOf(ctx) / 2, y);
};

/** Renders the poster and resolves to a PNG blob ready to be saved. */
export const buildQrPoster = async ({
  qrSrc,
  restaurantName,
  tableNumber,
  logoSrc,
}: QrPosterInput): Promise<Blob> => {
  const imagesToLoad = [loadImage(qrSrc), ensureFonts()];
  if (logoSrc) {
    imagesToLoad.push(loadImage(logoSrc));
  }
  const results = await Promise.all(imagesToLoad);
  const qrImage = results[0] as HTMLImageElement | null;
  if (!qrImage) throw new Error("Failed to load QR code image");
  const logoImage = logoSrc && results[2] ? (results[2] as HTMLImageElement | null) : null;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser");

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Ground
  ctx.fillStyle = OBSIDIAN;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Two hairlines rather than one thick rule
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(30, 30, WIDTH - 60, HEIGHT - 60, 28);
  ctx.stroke();

  ctx.strokeStyle = GOLD_DEEP;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(46, 46, WIDTH - 92, HEIGHT - 92, 20);
  ctx.stroke();

  // ---- Header: Logo & restaurant name, then table number -------------------------
  let nameY = 190;
  if (logoImage && logoImage.complete && logoImage.naturalWidth > 0) {
    const logoSize = 110;
    const logoX = (WIDTH - logoSize) / 2;
    const logoY = 70;

    ctx.save();
    ctx.beginPath();
    ctx.arc(WIDTH / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
    ctx.restore();

    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(WIDTH / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.stroke();

    nameY = 225;
  }

  const name = restaurantName.trim() || "Restaurant";
  const nameSize = fitFontSize(
    ctx,
    name,
    (size) => `600 ${size}px ${DISPLAY}`,
    WIDTH - 220,
    76,
    40
  );

  ctx.fillStyle = IVORY;
  ctx.font = `600 ${nameSize}px ${DISPLAY}`;
  ctx.fillText(name, WIDTH / 2, nameY);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 90, 226);
  ctx.lineTo(WIDTH / 2 + 90, 226);
  ctx.stroke();

  const tableLabel = `TABLE ${tableNumber}`.toUpperCase();
  setTracking(ctx, "10px");
  const tableSize = fitFontSize(
    ctx,
    tableLabel,
    (size) => `700 ${size}px ${BODY}`,
    WIDTH - 320,
    46,
    26
  );
  ctx.font = `700 ${tableSize}px ${BODY}`;

  // The pill is measured from the text so a long table number widens it
  // instead of spilling out of it.
  const pillWidth = Math.min(ctx.measureText(tableLabel).width + 96, WIDTH - 200);
  const pillHeight = tableSize + 40;
  const pillY = 268;

  ctx.fillStyle = "rgba(201, 169, 97, 0.12)";
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect((WIDTH - pillWidth) / 2, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = GOLD;
  fillCentred(ctx, tableLabel, WIDTH / 2, pillY + pillHeight / 2 + tableSize / 3);
  setTracking(ctx, "0px");

  // ---- The code itself ----------------------------------------------------

  const panelSize = 760;
  const panelX = (WIDTH - panelSize) / 2;
  const panelY = 420;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelSize, panelSize, 32);
  ctx.fill();

  // Padding inside the white panel adds to the QR's own margin; the combined
  // quiet zone is what lets a camera lock on against the dark card.
  const qrPadding = 34;
  const qrSize = panelSize - qrPadding * 2;
  ctx.drawImage(qrImage, panelX + qrPadding, panelY + qrPadding, qrSize, qrSize);

  ctx.fillStyle = IVORY_FAINT;
  setTracking(ctx, "3px");
  ctx.font = `500 27px ${BODY}`;
  fillCentred(
    ctx,
    "SCAN TO VIEW THE MENU & ORDER",
    WIDTH / 2,
    panelY + panelSize + 62
  );
  setTracking(ctx, "0px");

  // ---- Footer -------------------------------------------------------------

  ctx.strokeStyle = "rgba(201, 169, 97, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 150, HEIGHT - 200);
  ctx.lineTo(WIDTH / 2 + 150, HEIGHT - 200);
  ctx.stroke();

  ctx.fillStyle = IVORY_FAINT;
  setTracking(ctx, "6px");
  ctx.font = `500 22px ${BODY}`;
  fillCentred(ctx, "POWERED BY", WIDTH / 2, HEIGHT - 148);

  ctx.fillStyle = GOLD;
  setTracking(ctx, "8px");
  ctx.font = `700 42px ${BODY}`;
  fillCentred(ctx, "MONK DEVELOPER", WIDTH / 2, HEIGHT - 92);
  setTracking(ctx, "0px");

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode the poster")),
      "image/png"
    );
  });
};

/** Saves a blob under `filename`, revoking the temporary URL afterwards. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};
