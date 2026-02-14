const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const workspace = document.getElementById("workspace");
const canvas = document.getElementById("editorCanvas");
const cropButton = document.getElementById("cropButton");
const downloadLink = document.getElementById("downloadLink");

const ctx = canvas.getContext("2d");

const state = {
  image: null,
  baseScale: 1,
  offsetX: 0,
  offsetY: 0,
  drawnWidth: 0,
  drawnHeight: 0,
  cropRect: null,
  dragMode: null,
  pointerStart: null,
  rectStart: null,
};

const HANDLE_SIZE = 12;
const MIN_RECT_SIZE = 30;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function imageBounds() {
  return {
    left: state.offsetX,
    top: state.offsetY,
    right: state.offsetX + state.drawnWidth,
    bottom: state.offsetY + state.drawnHeight,
  };
}

function normalizeRect(rect) {
  const bounds = imageBounds();
  rect.left = clamp(rect.left, bounds.left, bounds.right - MIN_RECT_SIZE);
  rect.right = clamp(rect.right, rect.left + MIN_RECT_SIZE, bounds.right);
  rect.top = clamp(rect.top, bounds.top, bounds.bottom - MIN_RECT_SIZE);
  rect.bottom = clamp(rect.bottom, rect.top + MIN_RECT_SIZE, bounds.bottom);
  return rect;
}

function resetCropRect() {
  const bounds = imageBounds();
  const padding = Math.min(state.drawnWidth, state.drawnHeight) * 0.1;
  state.cropRect = {
    left: bounds.left + padding,
    top: bounds.top + padding,
    right: bounds.right - padding,
    bottom: bounds.bottom - padding,
  };
}

function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) return;

  const image = new Image();
  image.onload = () => {
    state.image = image;

    const maxCanvasWidth = 960;
    const maxCanvasHeight = 540;
    const ratio = Math.min(maxCanvasWidth / image.width, maxCanvasHeight / image.height, 1);

    state.drawnWidth = Math.round(image.width * ratio);
    state.drawnHeight = Math.round(image.height * ratio);
    canvas.width = state.drawnWidth;
    canvas.height = state.drawnHeight;

    state.baseScale = ratio;
    state.offsetX = 0;
    state.offsetY = 0;

    resetCropRect();
    workspace.classList.remove("hidden");
    cropButton.disabled = false;
    downloadLink.classList.add("hidden");

    draw();
  };

  image.src = URL.createObjectURL(file);
}

function drawOverlay() {
  const { left, top, right, bottom } = state.cropRect;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, 0, canvas.width, top);
  ctx.fillRect(0, top, left, bottom - top);
  ctx.fillRect(right, top, canvas.width - right, bottom - top);
  ctx.fillRect(0, bottom, canvas.width, canvas.height - bottom);

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, right - left, bottom - top);

  ctx.fillStyle = "#38bdf8";
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  ctx.fillRect(left - HANDLE_SIZE / 2, midY - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE); // left
  ctx.fillRect(right - HANDLE_SIZE / 2, midY - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE); // right
  ctx.fillRect(midX - HANDLE_SIZE / 2, top - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE); // top
  ctx.fillRect(midX - HANDLE_SIZE / 2, bottom - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE); // bottom

  ctx.restore();
}

function draw() {
  if (!state.image) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(state.image, state.offsetX, state.offsetY, state.drawnWidth, state.drawnHeight);
  drawOverlay();
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function hitTestHandle(point) {
  const { left, top, right, bottom } = state.cropRect;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const handles = [
    { mode: "left", x: left, y: midY },
    { mode: "right", x: right, y: midY },
    { mode: "top", x: midX, y: top },
    { mode: "bottom", x: midX, y: bottom },
  ];

  return handles.find((handle) => {
    return (
      point.x >= handle.x - HANDLE_SIZE &&
      point.x <= handle.x + HANDLE_SIZE &&
      point.y >= handle.y - HANDLE_SIZE &&
      point.y <= handle.y + HANDLE_SIZE
    );
  });
}

function isPointInRect(point, rect) {
  return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

canvas.addEventListener("pointerdown", (event) => {
  if (!state.cropRect) return;
  const point = pointerPosition(event);
  const handle = hitTestHandle(point);

  if (handle) {
    state.dragMode = handle.mode;
  } else if (isPointInRect(point, state.cropRect)) {
    state.dragMode = "move";
  } else {
    state.dragMode = null;
    return;
  }

  state.pointerStart = point;
  state.rectStart = { ...state.cropRect };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.dragMode || !state.cropRect || !state.rectStart || !state.pointerStart) return;

  const point = pointerPosition(event);
  const dx = point.x - state.pointerStart.x;
  const dy = point.y - state.pointerStart.y;
  const next = { ...state.rectStart };

  if (state.dragMode === "left") next.left += dx;
  if (state.dragMode === "right") next.right += dx;
  if (state.dragMode === "top") next.top += dy;
  if (state.dragMode === "bottom") next.bottom += dy;
  if (state.dragMode === "move") {
    next.left += dx;
    next.right += dx;
    next.top += dy;
    next.bottom += dy;

    const bounds = imageBounds();
    const width = next.right - next.left;
    const height = next.bottom - next.top;

    if (next.left < bounds.left) {
      next.left = bounds.left;
      next.right = bounds.left + width;
    }
    if (next.right > bounds.right) {
      next.right = bounds.right;
      next.left = bounds.right - width;
    }
    if (next.top < bounds.top) {
      next.top = bounds.top;
      next.bottom = bounds.top + height;
    }
    if (next.bottom > bounds.bottom) {
      next.bottom = bounds.bottom;
      next.top = bounds.bottom - height;
    }
  }

  state.cropRect = normalizeRect(next);
  draw();
});

function stopDrag(event) {
  if (state.dragMode) {
    canvas.releasePointerCapture(event.pointerId);
  }
  state.dragMode = null;
  state.pointerStart = null;
  state.rectStart = null;
}

canvas.addEventListener("pointerup", stopDrag);
canvas.addEventListener("pointercancel", stopDrag);

cropButton.addEventListener("click", () => {
  if (!state.image || !state.cropRect) return;

  const { left, top, right, bottom } = state.cropRect;

  const sx = Math.round(left / state.baseScale);
  const sy = Math.round(top / state.baseScale);
  const sw = Math.round((right - left) / state.baseScale);
  const sh = Math.round((bottom - top) / state.baseScale);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = sw;
  outCanvas.height = sh;

  const outCtx = outCanvas.getContext("2d");
  outCtx.drawImage(state.image, sx, sy, sw, sh, 0, 0, sw, sh);

  const url = outCanvas.toDataURL("image/png");
  downloadLink.href = url;
  downloadLink.download = "cropped.png";
  downloadLink.textContent = "トリミング画像をダウンロード";
  downloadLink.classList.remove("hidden");
});

fileInput.addEventListener("change", (event) => {
  loadImage(event.target.files?.[0]);
});

["dragenter", "dragover"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((name) => {
  dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
  });
});

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  loadImage(file);
});
