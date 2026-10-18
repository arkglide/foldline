// Rebuild the original typography atlas using the existing development browser.
// This is an offline asset-authoring step, never part of game startup.
import fs from "node:fs/promises";
import { chromium } from "playwright";
const source = new URL("../assets/art/l02/signage.svg", import.meta.url),
  target = new URL("../assets/art/l02/signage.png", import.meta.url);
const svg = await fs.readFile(source, "utf8");
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    (process.platform === "linux" ? "/usr/bin/chromium" : undefined),
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  const data = await page.evaluate(async (svg) => {
    const img = new Image();
    img.src =
      "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, svg);
  await fs.writeFile(target, Buffer.from(data, "base64"));
} finally {
  await browser.close();
}
