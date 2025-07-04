import './style.css';

const appEl = document.querySelector<HTMLDivElement>('#app')!;

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
  }

  const removeBgButton = document.createElement('button');
  removeBgButton.textContent = 'Remove Background';
  removeBgButton.addEventListener('click', (ev) => {
    ev.preventDefault();
    clearTool();

    imgCanvas.style.cursor = 'crosshair';
    removeBgButton.classList.add('active');
    imgCanvas.addEventListener('click', removeBgOnClick, { once: true });
  });
  buttonBar.appendChild(removeBgButton);

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
    selectStickerButton.disabled = false;
  }

  const selectStickerButton = document.createElement('button');
  selectStickerButton.textContent = 'Select Sticker';
  selectStickerButton.disabled = true;
  selectStickerButton.addEventListener('click', (ev) => {
    ev.preventDefault();
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
  buttonBar.appendChild(selectStickerButton);

  let down = false;
  let startX: number, startY: number;
  const renderLine = (endX = startX, endY = startY) => {
    hightlightCtx.clearRect(0, 0, width, height);
    drawLine(hightlightCtx, startX, startY, endX, endY, '#f008');
  };

  function selectMouseDown(ev: MouseEvent | TouchEvent) {
    ev.preventDefault();

    const { x, y } = getCanvasCoords(ev);
    down = true;
    startX = x;
    startY = y;
    renderLine();
  }
  function selectMouseMove(ev: MouseEvent | TouchEvent) {
    if (!down) return;
    ev.preventDefault();

    const { x, y } = getCanvasCoords(ev);
    renderLine(x, y);
  }
  function selectMouseUp(ev: MouseEvent | TouchEvent) {
    ev.preventDefault();
    down = false;

    const { x, y } = getCanvasCoords(ev);
    renderLine(x, y);

    selectSticker(startX, startY, x, y);
  }

  function selectSticker(x1: number, y1: number, x2: number, y2: number) {
    const { encode, decode } = packer(width, height);
    const imgData = imgCtx.getImageData(0, 0, width, height);
    const getColor = getImageDataColor.bind(null, imgData);

    const checked = new Set<number>();
    const matches = new Set<number>();

    const linePoints = getLinePoints(x1, y1, x2, y2);
    const toCheck: number[] = linePoints.map(([x, y]) => encode(x, y));

    console.time('find matches')
    while (toCheck.length) {
      const n = toCheck.pop()!;
      if (checked.has(n)) continue;

      const [x, y] = decode(n);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      checked.add(n);

      const [, , , a] = getColor(x, y);
      const isMatch = a !== 0;
      if (isMatch) {
        matches.add(n);
        toCheck.push(
          encode(x + 1, y), encode(x - 1, y),
          encode(x, y + 1), encode(x, y - 1),
        );
      }
    }
    console.timeEnd('find matches')

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const n of matches) {
      const [x, y] = decode(n);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    if (minX === maxX || minY === maxY) return;

    const newImageData = new ImageData(maxX - minX, maxY - minY);
    for (const n of matches) {
      const [x, y] = decode(n);
      const [r, g, b, a] = getColor(x, y);
      const index = (y - minY) * newImageData.width * 4 + (x - minX) * 4;
      newImageData.data[index + 0] = r;
      newImageData.data[index + 1] = g;
      newImageData.data[index + 2] = b;
      newImageData.data[index + 3] = a;
      imgCtx.clearRect(x, y, 1, 1);
    }

    hightlightCtx.clearRect(0, 0, width, height);
    hightlightCtx.putImageData(newImageData, minX, minY);

    hightlightCtx.strokeStyle = '#00fa';
    hightlightCtx.lineWidth = 6;
    hightlightCtx.rect(minX, minY, maxX - minX, maxY - minY);
    hightlightCtx.stroke();

    const renderCanvas = new OffscreenCanvas(newImageData.width, newImageData.height);
    renderCanvas.getContext('2d')!.putImageData(newImageData, 0, 0);
    renderCanvas.convertToBlob({ type: 'image/png' }).then(onSticker);
  }

  const stickers: { blob: Blob, url: string }[] = [];
  const downloadStickerButton = document.createElement('button');
  downloadStickerButton.textContent = 'Download All Stickers';
  downloadStickerButton.addEventListener('click', (ev) => {
    ev.preventDefault();

    const rnd = Math.random().toString(36).substring(2, 5);
    for (let i = 0; i < stickers.length; i++) {
      const { url } = stickers[i];
      const filename = 'Sticker' + rnd + '-' + (i + 1) + '.png';
      download(url, filename);
    }
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

function getLinePoints(x1: number, y1: number, x2: number, y2: number) {
  const cells = [];

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
