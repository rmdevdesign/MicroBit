// Horizon artificiel (canvas 2D). Independant de three.js et du reste de l'app.
const DEFAULT_CARDINALS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

// getCardinals() renvoie les 8 points cardinaux dans la langue courante.
export function createAttitudeIndicator(canvas, getCardinals = () => DEFAULT_CARDINALS) {
  const frame = canvas.parentElement;
  const view = { size: 0, dpr: 1 };

  // Le canevas suit la taille affichee et la densite de pixels de l'ecran :
  // net sur Retina, et adapte aux petits cadrans des telephones.
  function resize() {
    const size = Math.round(frame.clientWidth);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!size || (size === view.size && dpr === view.dpr)) {
      return;
    }
    view.size = size;
    view.dpr = dpr;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }

  new ResizeObserver(resize).observe(frame);
  resize();

  return {
    // headingDeg = null masque la pastille de cap.
    draw(pitchDeg, rollRad, headingDeg = null) {
      resize();
      drawAttitudeIndicator(canvas, view, pitchDeg, rollRad, headingDeg, getCardinals());
    },
  };
}

function fillTriangle(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  ctx.lineTo(points[1][0], points[1][1]);
  ctx.lineTo(points[2][0], points[2][1]);
  ctx.closePath();
  ctx.fill();
}

// Horizon artificiel : ciel/sol aux couleurs du site, echelle de tangage, echelle
// d'inclinaison fixe avec index mobile, symbole d'avion et, si le cap boussole est
// actif, une pastille de cap. En dessous de 130 px, version simplifiee.
function drawAttitudeIndicator(canvas, view, pitchDeg, rollRad, headingDeg, cardinals) {
  const { size, dpr } = view;
  if (!size) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const r = size / 2;
  const compact = size < 130;
  const unit = size / 220;
  const pxPerDeg = size / 70;
  const ringRadius = r - 3;
  const tickLength = size * 0.05;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  // Ciel, sol et echelle de tangage : tournent avec le roulis, glissent avec le tangage.
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(r, r);
  ctx.rotate(rollRad);
  ctx.translate(0, pitchDeg * pxPerDeg);

  const span = size * 1.6;
  const sky = ctx.createLinearGradient(0, -span, 0, 0);
  sky.addColorStop(0, "#3a41b0");
  sky.addColorStop(1, "#25c4e2");
  ctx.fillStyle = sky;
  ctx.fillRect(-span, -span, span * 2, span);

  const ground = ctx.createLinearGradient(0, 0, 0, span);
  ground.addColorStop(0, "#2b2e36");
  ground.addColorStop(1, "#0f1115");
  ctx.fillStyle = ground;
  ctx.fillRect(-span, 0, span * 2, span);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = Math.max(1.8, 2.2 * unit);
  ctx.beginPath();
  ctx.moveTo(-span, 0);
  ctx.lineTo(span, 0);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.font = `600 ${Math.max(9, size * 0.058)}px 'DM Sans', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const ladder = compact ? [10, 20] : [10, 20, 30, 40];
  for (const deg of ladder) {
    const isMajor = deg % 20 === 0;
    const half = size * (isMajor ? 0.16 : 0.09);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = compact ? 1.6 : isMajor ? 2 : 1.4;
    for (const sign of [1, -1]) {
      const y = -sign * deg * pxPerDeg;
      // Les reperes qui approchent de l'echelle d'inclinaison s'estompent.
      const reach = Math.hypot(half + size * 0.11, y + pitchDeg * pxPerDeg);
      const fade = Math.min(1, Math.max(0, (r * 0.86 - reach) / (r * 0.08)));
      if (fade <= 0) {
        continue;
      }
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
      if (isMajor && !compact) {
        const gap = size * 0.055;
        ctx.fillText(String(deg), -half - gap, y);
        ctx.fillText(String(deg), half + gap, y);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Vignette : donne du relief au cadran et fait ressortir les reperes.
  const vignette = ctx.createRadialGradient(r, r, r * 0.55, r, r, r);
  vignette.addColorStop(0, "rgba(15, 17, 21, 0)");
  vignette.addColorStop(1, "rgba(15, 17, 21, 0.55)");
  ctx.fillStyle = vignette;
  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.fill();

  // Echelle d'inclinaison fixe (le zero est materialise par le triangle jaune).
  ctx.save();
  ctx.translate(r, r);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  const bankMarks = compact ? [-60, -30, 30, 60] : [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60];
  for (const deg of bankMarks) {
    const angle = (deg * Math.PI) / 180 - Math.PI / 2;
    const isMajor = Math.abs(deg) % 30 === 0;
    const inner = ringRadius - tickLength * (isMajor ? 1.3 : 0.8);
    ctx.lineWidth = isMajor ? Math.max(1.6, 2 * unit) : Math.max(1.2, 1.4 * unit);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius);
    ctx.lineTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.stroke();
  }

  const half = size * 0.03;
  fillTriangle(ctx, [
    [0, -(ringRadius - size * 0.06)],
    [-half, -ringRadius],
    [half, -ringRadius],
  ], "#ffd166");

  // Index d'inclinaison mobile.
  ctx.rotate(rollRad);
  fillTriangle(ctx, [
    [0, -(ringRadius - size * 0.075)],
    [-half, -(ringRadius - size * 0.125)],
    [half, -(ringRadius - size * 0.125)],
  ], "#ffffff");
  ctx.restore();

  // Symbole d'avion, fixe au centre.
  ctx.save();
  ctx.translate(r, r);
  ctx.strokeStyle = "#ffd166";
  ctx.fillStyle = "#ffd166";
  ctx.lineWidth = Math.max(2, 3 * unit);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 30 * unit, 0);
    ctx.lineTo(side * 10 * unit, 0);
    ctx.lineTo(side * 4 * unit, 7 * unit);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2, 2.8 * unit), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Pastille de cap (seulement si le cap boussole est active).
  if (headingDeg !== null) {
    const heading = ((Math.round(headingDeg) % 360) + 360) % 360;
    const label = `${cardinals[Math.round(heading / 45) % 8]} ${String(heading).padStart(3, "0")}°`;
    ctx.font = `600 ${Math.max(9, size * 0.062)}px 'DM Sans', 'Segoe UI', sans-serif`;
    const padX = size * 0.04;
    const height = Math.max(14, size * 0.11);
    const width = ctx.measureText(label).width + padX * 2;
    const x = r - width / 2;
    const y = r + r * 0.74 - height / 2;
    ctx.fillStyle = "rgba(15, 17, 21, 0.72)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, width, height, height / 2);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, r, y + height / 2 + 0.5);
  }

  // Lunette.
  ctx.beginPath();
  ctx.arc(r, r, r - 1.5, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.stroke();
}
