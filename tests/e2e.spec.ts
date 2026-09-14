import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const fixturePath = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function crc32(buf: Buffer) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function makeSubjectPng(size: number) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let offset = 0;
  const cx = size / 2;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const inside = Math.hypot(x - cx, y - cx) < size * 0.3;
      const [r, g, b] = inside ? [255, 255, 255] : [0x33, 0x66, 0xcc];
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#area').click(),
  ]);
  await chooser.setFiles(file);
  await expect(page.locator('#imgCanvas')).toBeVisible();
}

function canvasPoint(page: Page, fx: number, fy: number) {
  return page.locator('#imgCanvas').evaluate((element, [fx, fy]) => {
    const canvas = element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const drawWidth = canvas.width * scale;
    const drawHeight = canvas.height * scale;
    const startX = rect.left + rect.width / 2 - drawWidth / 2;
    const startY = rect.top + rect.height / 2 - drawHeight / 2;
    return { x: startX + drawWidth * fx, y: startY + drawHeight * fy };
  }, [fx, fy]);
}

function canvasAlpha(page: Page, fx: number, fy: number) {
  return page.locator('#imgCanvas').evaluate((element, [fx, fy]) => {
    const canvas = element as HTMLCanvasElement;
    const x = Math.floor(canvas.width * fx);
    const y = Math.floor(canvas.height * fy);
    return canvas.getContext('2d')!.getImageData(x, y, 1, 1).data[3];
  }, [fx, fy]);
}

test('manual removal + sticker extraction', async ({ page }) => {
  await page.goto('/');
  await upload(page, { name: 'subject.png', mimeType: 'image/png', buffer: makeSubjectPng(200) });

  await page.getByRole('button', { name: 'Remove Background' }).click();
  await expect(page.locator('#dialog')).toBeVisible();
  await page.locator('.dialogChoice', { hasText: 'Manual' }).click();

  const background = await canvasPoint(page, 0.05, 0.05);
  await page.mouse.click(background.x, background.y);

  await expect.poll(() => canvasAlpha(page, 0.01, 0.01)).toBe(0);
  expect(await canvasAlpha(page, 0.5, 0.5)).toBe(255);

  await page.locator('#selectToggleButton').click();
  await expect(page.locator('#selectMenu')).toBeVisible();
  await expect(page.locator('#selectMenu .selectMenuItem.active')).toContainText('Line');
  await page.keyboard.press('Escape');
  await expect(page.locator('#selectMenu')).toBeHidden();

  await page.getByRole('button', { name: 'Select Sticker' }).click();
  const start = await canvasPoint(page, 0.35, 0.5);
  const end = await canvasPoint(page, 0.65, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('#stickerContainer img')).toHaveCount(1);
});

test('freeform selection via split button', async ({ page }) => {
  await page.goto('/');
  await upload(page, { name: 'subject.png', mimeType: 'image/png', buffer: makeSubjectPng(200) });

  await page.getByRole('button', { name: 'Remove Background' }).click();
  await page.locator('.dialogChoice', { hasText: 'Manual' }).click();
  const background = await canvasPoint(page, 0.05, 0.05);
  await page.mouse.click(background.x, background.y);
  await expect.poll(() => canvasAlpha(page, 0.01, 0.01)).toBe(0);

  await page.locator('#selectToggleButton').click();
  await page.locator('#selectMenu .selectMenuItem', { hasText: 'Freeform' }).click();
  await expect(page.locator('#selectMenu')).toBeHidden();

  await page.locator('#selectToggleButton').click();
  await expect(page.locator('#selectMenu .selectMenuItem.active')).toContainText('Freeform');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Select Sticker' }).click();

  const waypoints = [
    await canvasPoint(page, 0.3, 0.45),
    await canvasPoint(page, 0.42, 0.56),
    await canvasPoint(page, 0.5, 0.44),
    await canvasPoint(page, 0.58, 0.56),
    await canvasPoint(page, 0.7, 0.45),
  ];
  await page.mouse.move(waypoints[0].x, waypoints[0].y);
  await page.mouse.down();
  for (const point of waypoints.slice(1)) await page.mouse.move(point.x, point.y, { steps: 10 });
  await page.mouse.up();

  await expect(page.locator('#stickerContainer img')).toHaveCount(1);
});

test('AI removal removes the background from a photo', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await upload(page, {
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    buffer: readFileSync(fixturePath('photo.jpg')),
  });

  await page.getByRole('button', { name: 'Remove Background' }).click();
  await expect(page.locator('#dialog')).toBeVisible();
  await page.locator('.dialogChoice', { hasText: 'AI' }).click();

  await expect(page.locator('#busy')).toBeVisible();
  await expect(page.locator('#busy')).toBeHidden({ timeout: 290_000 });

  expect(errors, errors.join('\n')).toEqual([]);
  await expect(page.getByRole('button', { name: 'Select Sticker' })).toBeEnabled();

  const stats = await page.locator('#imgCanvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparent++;
      else opaque++;
    }
    return { transparent, opaque, total: data.length / 4 };
  });

  expect(stats.transparent).toBeGreaterThan(0);
  expect(stats.opaque).toBeGreaterThan(0);

  // The AI matte has faint alpha in the background; selecting the subject must
  // not swallow the whole canvas.
  await page.getByRole('button', { name: 'Select Sticker' }).click();
  const start = await canvasPoint(page, 0.45, 0.5);
  const end = await canvasPoint(page, 0.55, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();

  const sticker = await page.locator('#stickerContainer img').first().evaluate((img) => ({
    w: (img as HTMLImageElement).naturalWidth,
    h: (img as HTMLImageElement).naturalHeight,
  }));
  expect(sticker.w).toBeGreaterThan(0);
  expect(sticker.w).toBeLessThan(700);
  expect(sticker.h).toBeLessThan(600);
});

test('faint alpha noise in the background does not leak into the selection', async ({ page }) => {
  await page.goto('/');
  await upload(page, { name: 'subject.png', mimeType: 'image/png', buffer: makeSubjectPng(200) });

  await page.getByRole('button', { name: 'Remove Background' }).click();
  await page.locator('.dialogChoice', { hasText: 'Manual' }).click();
  const background = await canvasPoint(page, 0.05, 0.05);
  await page.mouse.click(background.x, background.y);
  await expect.poll(() => canvasAlpha(page, 0.01, 0.01)).toBe(0);

  // Mimic an AI matte: nearly transparent but non-zero alpha everywhere in the
  // background, fully connecting it to the subject.
  await page.locator('#imgCanvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.data.length; i += 4) {
      if (data.data[i] === 0) data.data[i] = 2;
    }
    ctx.putImageData(data, 0, 0);
  });

  await page.getByRole('button', { name: 'Select Sticker' }).click();
  const start = await canvasPoint(page, 0.35, 0.5);
  const end = await canvasPoint(page, 0.65, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();

  const sticker = await page.locator('#stickerContainer img').first().evaluate((img) => ({
    w: (img as HTMLImageElement).naturalWidth,
    h: (img as HTMLImageElement).naturalHeight,
  }));
  expect(sticker.w).toBeLessThan(160);
  expect(sticker.h).toBeLessThan(160);
});
