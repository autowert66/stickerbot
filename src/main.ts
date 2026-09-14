import { removeBackground, preload } from '@imgly/background-removal';
import { zip } from 'fflate';
import './style.css';

const appEl = document.querySelector<HTMLDivElement>('#app')!;

const AI_CONFIG = { device: 'gpu' as const };

const busy = document.createElement('div');
busy.id = 'busy';
busy.hidden = true;
busy.innerHTML = `
  <div class="busyCard">
    <div class="spinner"></div>
    <div class="busyLabel"></div>
    <div class="busyBar"><div class="busyBarFill"></div></div>
  </div>
`;
document.body.appendChild(busy);
const busyLabel = busy.querySelector<HTMLDivElement>('.busyLabel')!;
const busyBar = busy.querySelector<HTMLDivElement>('.busyBar')!;
const busyBarFill = busy.querySelector<HTMLDivElement>('.busyBarFill')!;

function showBusy(message: string, progress?: number) {
  busy.hidden = false;
  busyLabel.textContent = message;
  busyBar.style.display = progress == null ? 'none' : '';
  busyBarFill.style.width = `${Math.round((progress ?? 0) * 100)}%`;
}

function hideBusy() {
  busy.hidden = true;
}

interface DialogChoice {
  label: string;
  description?: string;
  onSelect: () => void;
}

function openChoiceDialog(options: { title: string; message?: string; choices: DialogChoice[] }) {
  const backdrop = document.createElement('div');
  backdrop.id = 'dialogBackdrop';

  const dialog = document.createElement('div');
  dialog.id = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', options.title);

  const title = document.createElement('h2');
  title.textContent = options.title;
  dialog.appendChild(title);

  if (options.message) {
    const message = document.createElement('p');
    message.className = 'dialogMessage';
    message.textContent = options.message;
    dialog.appendChild(message);
  }

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') close();
  };

  const choicesEl = document.createElement('div');
  choicesEl.className = 'dialogChoices';

  for (const choice of options.choices) {
    const button = document.createElement('button');
    button.className = 'dialogChoice';

    const label = document.createElement('span');
    label.className = 'dialogChoiceLabel';
    label.textContent = choice.label;
    button.appendChild(label);

    if (choice.description) {
      const description = document.createElement('span');
      description.className = 'dialogChoiceDesc';
      description.textContent = choice.description;
      button.appendChild(description);
    }

    button.addEventListener('click', () => {
      close();
      choice.onSelect();
    });
    choicesEl.appendChild(button);
  }

  dialog.appendChild(choicesEl);

  const cancel = document.createElement('button');
  cancel.className = 'dialogCancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);
  dialog.appendChild(cancel);

  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) close();
  });

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onKeyDown);
  dialog.querySelector('button')?.focus();
}

const area = document.createElement('div');
area.id = 'area';
area.textContent = 'Drop or click to upload an image';
appEl.appendChild(area);

area.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  area.classList.add('dragover');
});

area.addEventListener('dragleave', (ev) => {
  ev.preventDefault();
  area.classList.remove('dragover');
});

area.addEventListener('drop', (ev) => {
  ev.preventDefault();
  onFiles(ev.dataTransfer?.files);
});

area.addEventListener('click', (ev) => {
  ev.preventDefault();
  area.classList.remove('dragover');

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', (ev) => {
    ev.preventDefault();
    onFiles(input.files);
  }, { once: true });
  input.click();
});

function onFiles(files: FileList | null | undefined) {
  area.classList.remove('dragover');
  if (!files) return;

  if (files.length !== 1) {
    alert('Please only upload one image');
    return;
  }

  const file = files[0];
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image');
    return;
  }

  const url = URL.createObjectURL(file);
  onImage(url);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode image'));
    }, 'image/png');
  });
}

async function onImage(url: string) {
  const img = await loadImage(url);
  const { width, height } = img;

  const container = document.createElement('div');
  container.id = 'container';
  container.style.aspectRatio = `${width}/${height}`;

  const buttonBar = document.createElement('div');
  buttonBar.id = 'buttonBar';

  const imgCanvas = document.createElement('canvas');
  const imgCtx = imgCanvas.getContext('2d')!;
  imgCanvas.id = 'imgCanvas';
  imgCanvas.width = width;
  imgCanvas.height = height;
  imgCtx.drawImage(img, 0, 0);

  const hightlightCanvas = document.createElement('canvas');
  const hightlightCtx = hightlightCanvas.getContext('2d')!;
  hightlightCanvas.id = 'hightlightCanvas';
  hightlightCanvas.width = width;
  hightlightCanvas.height = height;
  hightlightCanvas.style.pointerEvents = 'none';
  hightlightCanvas.style.zIndex = '2';

  const stickerContainer = document.createElement('div');
  stickerContainer.id = 'stickerContainer';
  stickerContainer.innerHTML = `<h1>Stickers</h1>`;

  area.remove();
  container.appendChild(imgCanvas);
  container.appendChild(hightlightCanvas);
  appEl.appendChild(buttonBar);
  appEl.appendChild(container);
  appEl.appendChild(stickerContainer);

  const clearTool = () => {
    imgCanvas.style.cursor = 'default';

    removeBgButton.classList.remove('active');
    imgCanvas.removeEventListener('click', removeBgOnClick);

    selectStickerButton.classList.remove('active');
    imgCanvas.removeEventListener('mousedown', selectMouseDown);
    imgCanvas.removeEventListener('mousemove', selectMouseMove);
    imgCanvas.removeEventListener('mouseup', selectMouseUp);
    imgCanvas.removeEventListener('touchstart', selectMouseDown);
    imgCanvas.removeEventListener('touchmove', selectMouseMove);
    imgCanvas.removeEventListener('touchend', selectMouseUp);

    closeSelectMenu();
  }

  const removeBgButton = document.createElement('button');
  removeBgButton.textContent = 'Remove Background';
  removeBgButton.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (removeBgButton.disabled) return;

    openChoiceDialog({
      title: 'Remove Background',
      message: 'Choose how to erase the background.',
      choices: [
        {
          label: 'AI (automatic)',
          description: 'Runs an on-device model. Best for photos and complex edges.',
          onSelect: removeBackgroundWithAI,
        },
        {
          label: 'Manual (click a color)',
          description: 'Flood-fills the color you click, like a magic wand.',
          onSelect: startManualRemoval,
        },
      ],
    });
  });
  buttonBar.appendChild(removeBgButton);

  function startManualRemoval() {
    clearTool();

    imgCanvas.style.cursor = 'crosshair';
    removeBgButton.classList.add('active');
    imgCanvas.addEventListener('click', removeBgOnClick, { once: true });
  }

  async function removeBackgroundWithAI() {
    clearTool();
    removeBgButton.disabled = true;

    let resultUrl: string | undefined;
    try {
      await preload({
        ...AI_CONFIG,
        progress: (_key, current, total) => {
          showBusy('Downloading model…', total ? current / total : undefined);
        },
      });

      showBusy('Removing background…');
      const sourceBlob = await canvasToBlob(imgCanvas);
      const resultBlob = await removeBackground(sourceBlob, AI_CONFIG);

      resultUrl = URL.createObjectURL(resultBlob);
      const resultImg = await loadImage(resultUrl);

      imgCtx.clearRect(0, 0, width, height);
      imgCtx.drawImage(resultImg, 0, 0, width, height);
      enableSelectTool();
    } catch (err) {
      console.error(err);
      alert(`Background removal failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      hideBusy();
      removeBgButton.disabled = false;
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    }
  }

  function removeBgOnClick(ev: MouseEvent) {
    const { x, y } = getCanvasCoords(ev);

    const { encode, decode } = packer(width, height);
    const imgData = imgCtx.getImageData(0, 0, width, height);
    const getColor = getImageDataColor.bind(null, imgData);
    const targetColor = getColor(x, y);

    const checked = new Set<number>();
    const matches = new Set<number>();
    const toCheck: number[] = [encode(x, y)];

    console.time('find matches')
    while (toCheck.length) {
      const n = toCheck.pop()!;
      if (checked.has(n)) continue;

      const [x, y] = decode(n);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      checked.add(n);

      const color = getColor(x, y);
      const isMatch = compareColors(targetColor, color, 12);
      if (isMatch) {
        matches.add(n);
        toCheck.push(
          encode(x + 1, y), encode(x - 1, y),
          encode(x, y + 1), encode(x, y - 1),
        );
      }
    }
    console.timeEnd('find matches')

    for (const n of matches) {
      const [x, y] = decode(n);
      imgCtx.clearRect(x, y, 1, 1);
    }

    clearTool();
    enableSelectTool();
  }

  type SelectMode = 'line' | 'freeform';
  let selectMode: SelectMode = 'line';

  const selectWrapper = document.createElement('div');
  selectWrapper.id = 'selectTool';

  const selectStickerButton = document.createElement('button');
  selectStickerButton.id = 'selectStickerButton';
  selectStickerButton.textContent = 'Select Sticker';
  selectStickerButton.disabled = true;
  selectStickerButton.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (selectStickerButton.disabled) return;
    if (selectStickerButton.classList.contains('active')) {
      clearTool();
      return;
    }

    clearTool();
    imgCanvas.style.cursor = 'crosshair';
    selectStickerButton.classList.add('active');
    imgCanvas.addEventListener('mousedown', selectMouseDown);
    imgCanvas.addEventListener('mousemove', selectMouseMove);
    imgCanvas.addEventListener('mouseup', selectMouseUp);
    imgCanvas.addEventListener('touchstart', selectMouseDown);
    imgCanvas.addEventListener('touchmove', selectMouseMove);
    imgCanvas.addEventListener('touchend', selectMouseUp);
  });

  const selectToggleButton = document.createElement('button');
  selectToggleButton.id = 'selectToggleButton';
  selectToggleButton.type = 'button';
  selectToggleButton.disabled = true;
  selectToggleButton.setAttribute('aria-haspopup', 'true');
  selectToggleButton.setAttribute('aria-expanded', 'false');
  selectToggleButton.setAttribute('aria-label', 'Choose selection mode');
  selectToggleButton.textContent = '▾';

  const selectMenu = document.createElement('div');
  selectMenu.id = 'selectMenu';
  selectMenu.hidden = true;
  selectMenu.setAttribute('role', 'menu');

  const selectModes: { mode: SelectMode; label: string; hint: string }[] = [
    { mode: 'line', label: 'Line', hint: 'Swipe a straight line across the sticker' },
    { mode: 'freeform', label: 'Freeform', hint: 'Draw freely over the sticker' },
  ];

  const selectMenuItems = selectModes.map((option) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'selectMenuItem';
    item.setAttribute('role', 'menuitemradio');

    const check = document.createElement('span');
    check.className = 'selectMenuCheck';

    const text = document.createElement('span');
    text.className = 'selectMenuText';

    const label = document.createElement('strong');
    label.textContent = option.label;

    const hint = document.createElement('small');
    hint.textContent = option.hint;

    text.appendChild(label);
    text.appendChild(hint);
    item.appendChild(check);
    item.appendChild(text);

    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setSelectMode(option.mode);
      closeSelectMenu();
    });

    selectMenu.appendChild(item);
    return item;
  });

  function setSelectMode(mode: SelectMode) {
    selectMode = mode;
    selectModes.forEach((option, index) => {
      const active = option.mode === mode;
      selectMenuItems[index].classList.toggle('active', active);
      selectMenuItems[index].setAttribute('aria-checked', String(active));
    });
    selectStickerButton.title = `Select Sticker (${mode})`;
  }

  function enableSelectTool() {
    selectStickerButton.disabled = false;
    selectToggleButton.disabled = false;
  }

  function closeSelectMenu() {
    selectMenu.hidden = true;
    selectToggleButton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown);
  }

  function onDocumentPointerDown(ev: PointerEvent) {
    if (ev.target instanceof Node && (selectWrapper.contains(ev.target) || selectMenu.contains(ev.target))) return;
    closeSelectMenu();
  }

  function onDocumentKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      closeSelectMenu();
      selectToggleButton.focus();
    }
  }

  function openSelectMenu() {
    selectMenu.hidden = false;
    selectToggleButton.setAttribute('aria-expanded', 'true');

    const rect = selectToggleButton.getBoundingClientRect();
    const width = 240;
    selectMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    selectMenu.style.top = `${rect.bottom + 4}px`;

    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onDocumentKeyDown);
  }

  selectToggleButton.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (selectToggleButton.disabled) return;
    if (selectMenu.hidden) openSelectMenu();
    else closeSelectMenu();
  });

  setSelectMode('line');

  selectWrapper.appendChild(selectStickerButton);
  selectWrapper.appendChild(selectToggleButton);
  selectWrapper.appendChild(selectMenu);
  buttonBar.appendChild(selectWrapper);

  let down = false;
  let startX: number, startY: number;
  let path: [number, number][] = [];

  const renderLine = (endX = startX, endY = startY) => {
    hightlightCtx.clearRect(0, 0, width, height);
    drawLine(hightlightCtx, startX, startY, endX, endY, '#f008');
  };

  const renderPath = () => {
    hightlightCtx.clearRect(0, 0, width, height);
    if (path.length === 0) return;

    hightlightCtx.beginPath();
    hightlightCtx.moveTo(path[0][0], path[0][1]);
    for (const [x, y] of path) hightlightCtx.lineTo(x, y);
    hightlightCtx.strokeStyle = '#f008';
    hightlightCtx.lineWidth = 3;
    hightlightCtx.lineJoin = 'round';
    hightlightCtx.lineCap = 'round';
    hightlightCtx.stroke();
  };

  function pushPathPoint(x: number, y: number) {
    const last = path[path.length - 1];
    if (!last) {
      path.push([x, y]);
      return;
    }

    for (const [px, py] of getLinePoints(last[0], last[1], x, y).slice(1)) {
      path.push([px, py]);
    }
  }

  function selectMouseDown(ev: MouseEvent | TouchEvent) {
    ev.preventDefault();

    const { x, y } = getCanvasCoords(ev);
    down = true;
    startX = x;
    startY = y;
    path = [];

    if (selectMode === 'line') {
      renderLine();
    } else {
      pushPathPoint(x, y);
      renderPath();
    }
  }

  function selectMouseMove(ev: MouseEvent | TouchEvent) {
    if (!down) return;
    ev.preventDefault();

    const { x, y } = getCanvasCoords(ev);
    if (selectMode === 'line') {
      renderLine(x, y);
    } else {
      pushPathPoint(x, y);
      renderPath();
    }
  }

  function selectMouseUp(ev: MouseEvent | TouchEvent) {
    ev.preventDefault();
    down = false;

    const { x, y } = getCanvasCoords(ev);

    let seeds: [number, number][];
    if (selectMode === 'line') {
      renderLine(x, y);
      seeds = getLinePoints(startX, startY, x, y);
    } else {
      pushPathPoint(x, y);
      renderPath();
      seeds = path;
    }

    selectSticker(seeds);
    path = [];
  }

  const SELECT_FEATHER_PASSES = 2;
  // The AI matte is soft: the background and the faint bridges it leaves
  // between neighbouring stickers sit below this opacity, while sticker cores
  // sit well above it. Treat anything fainter as background so stickers stay
  // separate, then let the feather pass recover the anti-aliased edge.
  const SELECT_CORE_ALPHA = 180;

  function selectSticker(seedPoints: [number, number][]) {
    const imgData = imgCtx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const pixelCount = width * height;
    const alphaAt = (n: number) => data[n * 4 + 3];

    const seedIndices: number[] = [];
    let seedAlpha = 0;
    for (const [x, y] of seedPoints) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const n = y * width + x;
      seedIndices.push(n);
      if (alphaAt(n) > seedAlpha) seedAlpha = alphaAt(n);
    }
    if (seedIndices.length === 0 || seedAlpha === 0) return;

    const visited = new Uint8Array(pixelCount);
    const stack = new Int32Array(pixelCount);

    // Flood the connected component reachable from the seeds through pixels
    // whose alpha is at least `limit`, collecting pixel indices into `out`.
    const grow = (limit: number, out: number[]) => {
      visited.fill(0);
      let top = 0;
      for (const n of seedIndices) {
        if (!visited[n] && alphaAt(n) >= limit) {
          visited[n] = 1;
          stack[top++] = n;
        }
      }
      while (top > 0) {
        const n = stack[--top];
        out.push(n);

        const x = n % width;
        const y = (n / width) | 0;
        if (x > 0) { const m = n - 1; if (!visited[m] && alphaAt(m) >= limit) { visited[m] = 1; stack[top++] = m; } }
        if (x < width - 1) { const m = n + 1; if (!visited[m] && alphaAt(m) >= limit) { visited[m] = 1; stack[top++] = m; } }
        if (y > 0) { const m = n - width; if (!visited[m] && alphaAt(m) >= limit) { visited[m] = 1; stack[top++] = m; } }
        if (y < height - 1) { const m = n + width; if (!visited[m] && alphaAt(m) >= limit) { visited[m] = 1; stack[top++] = m; } }
      }
    };

    console.time('find matches')
    const matches: number[] = [];
    grow(Math.min(SELECT_CORE_ALPHA, seedAlpha), matches);

    // Grow a couple of pixels back into the soft edge so cut-outs keep their
    // feathering without letting the region leak across the background.
    let frontier = matches.slice();
    for (let pass = 0; pass < SELECT_FEATHER_PASSES && frontier.length; pass++) {
      const next: number[] = [];
      for (const n of frontier) {
        const x = n % width;
        const y = (n / width) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;

            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

            const m = ny * width + nx;
            if (visited[m] || data[m * 4 + 3] === 0) continue;

            visited[m] = 1;
            matches.push(m);
            next.push(m);
          }
        }
      }
      frontier = next;
    }
    console.timeEnd('find matches');

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (const n of matches) {
      const x = n % width;
      const y = (n / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    if (maxX < 0 || minX === maxX || minY === maxY) return;

    const outWidth = maxX - minX + 1;
    const outHeight = maxY - minY + 1;
    const newImageData = new ImageData(outWidth, outHeight);
    for (const n of matches) {
      const x = n % width;
      const y = (n / width) | 0;
      const source = n * 4;
      const target = ((y - minY) * outWidth + (x - minX)) * 4;
      newImageData.data[target + 0] = data[source + 0];
      newImageData.data[target + 1] = data[source + 1];
      newImageData.data[target + 2] = data[source + 2];
      newImageData.data[target + 3] = data[source + 3];
      data[source + 3] = 0;
    }
    imgCtx.putImageData(imgData, 0, 0);

    hightlightCtx.clearRect(0, 0, width, height);
    hightlightCtx.putImageData(newImageData, minX, minY);

    hightlightCtx.strokeStyle = '#00fa';
    hightlightCtx.lineWidth = 6;
    hightlightCtx.strokeRect(minX, minY, outWidth, outHeight);

    const renderCanvas = new OffscreenCanvas(outWidth, outHeight);
    renderCanvas.getContext('2d')!.putImageData(newImageData, 0, 0);
    renderCanvas.convertToBlob({ type: 'image/png' }).then(onSticker);
  }

  const stickers: { blob: Blob, url: string }[] = [];
  const downloadStickerButton = document.createElement('button');
  downloadStickerButton.textContent = 'Download All Stickers';
  downloadStickerButton.addEventListener('click', async (ev) => {
    ev.preventDefault();

    const files: Record<string, Uint8Array> = {};
    const rnd = Math.random().toString(36).substring(2, 5);
    for (let i = 0; i < stickers.length; i++) {
      const { blob } = stickers[i];
      const filename = 'Sticker' + rnd + '-' + (i + 1) + '.png';
      files[filename] = new Uint8Array(await blob.arrayBuffer());
    }

    zip(files, { level: 0 }, (err, data) => {
      if (err) return console.error(err);
      const blob = new Blob([data], { type: 'application/zip' });
      download(URL.createObjectURL(blob), 'Stickers' + rnd + '.zip');
    });
  });
  buttonBar.appendChild(downloadStickerButton);

  function onSticker(blob: Blob) {
    const url = URL.createObjectURL(blob);
    stickers.push({ blob, url });

    const img = document.createElement('img');
    img.src = url;
    img.addEventListener('click', () => download(url, 'sticker.png'));

    stickerContainer.appendChild(img);
  };
}

function compareColors(a: number[] | Uint8ClampedArray, b: number[] | Uint8ClampedArray, threshold = 0) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) <= threshold;
}

function getCanvasCoords(ev: MouseEvent | TouchEvent) {
  const canvas = ev.target as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();

  const { clientX, clientY } = ev instanceof MouseEvent ? ev : ev.changedTouches[0];

  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  const drawWidth = canvas.width * scale;
  const drawHeight = canvas.height * scale;

  const startX = rect.left + (rect.width / 2) - (drawWidth / 2);
  const startY = rect.top + (rect.height / 2) - (drawHeight / 2);

  const dx = clientX - startX;
  const dy = clientY - startY;

  const x = Math.round(dx / drawWidth * canvas.width);
  const y = Math.round(dy / drawHeight * canvas.height);

  return { x, y };
}

function packer(width: number, height: number) {
  const xBits = Math.ceil(Math.log2(width));
  const yBits = Math.ceil(Math.log2(height));
  const encode = (x: number, y: number) => (x << yBits) | y;
  const decode = (n: number) => [n >> yBits, n & ((1 << yBits) - 1)];

  return { encode, decode, xBits, yBits };
}

function getImageDataColor(imgData: ImageData, x: number, y: number) {
  const index = (y * imgData.width * 4) + (x * 4);
  return imgData.data.slice(index, index + 4);
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function getLinePoints(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const cells: [number, number][] = [];

  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  let sx = x1 < x2 ? 1 : -1;
  let sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    cells.push([x1, y1]);

    if (x1 === x2 && y1 === y2) break;

    let e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
  }

  return cells;
}

// TODO
/* function findMatching(ctx: CanvasRenderingContext2D, matcher: (color: number[]) => boolean, _toCheck: (number | [number, number])[]) {
  const { width, height } = ctx.canvas;
  const { encode, decode } = packer(width, height);

  const toCheck = _toCheck.map((v) => typeof v === 'number' ? v : encode(...v));

  const checked = new Set<number>();
  const matches = new Set<number>();

  console.time('find matches')
  while (toCheck.length) {
    const n = toCheck.pop()!;
    if (checked.has(n)) continue;

    const [x, y] = decode(n);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    checked.add(n);

    const color = getColor(x, y);
    const isMatch = compareColors(targetColor, color, 12);
    if (isMatch) {
      matches.add(n);
      toCheck.push(
        encode(x + 1, y), encode(x - 1, y),
        encode(x, y + 1), encode(x, y - 1),
      );
    }
  }
  console.timeEnd('find matches')
} */

function download(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}
