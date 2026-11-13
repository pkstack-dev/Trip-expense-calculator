/**
 * 1:1 Port of SummaryImageExporter.kt to HTML5 Canvas
 * Renders a crisp 1080px-wide summary card image ready for LINE sharing or downloading.
 */

const IMG_WIDTH = 1080;
const OUTER_PAD = 36;
const CARD_LEFT = OUTER_PAD;
const CARD_RIGHT = IMG_WIDTH - OUTER_PAD;
const CARD_WIDTH = CARD_RIGHT - CARD_LEFT;
const CARD_RADIUS = 40;
const INNER_PAD = 44;
const CONTENT_LEFT = CARD_LEFT + INNER_PAD;
const CONTENT_RIGHT = CARD_RIGHT - INNER_PAD;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const MAX_EXPENSE_ROWS = 14;

const FONT_STACK = "'Google Sans', 'Plus Jakarta Sans', 'Noto Sans Thai', sans-serif";

function makeFont(weight, sizePx) {
  return `${weight} ${sizePx}px ${FONT_STACK}`;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fillStyle) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

function strokeRoundRect(ctx, x, y, w, h, r, strokeStyle, lineWidth = 2) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function wrapTextLines(ctx, text, maxWidth, font, lineHeight) {
  ctx.save();
  ctx.font = font;
  const raw = (text || "").trim() || "-";
  // Segment by words or Thai characters gracefully
  const tokens = raw.split(/(\s+)/);
  const lines = [];
  let current = "";

  for (const token of tokens) {
    const test = current + token;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current.trim()) {
        lines.push(current.trim());
        current = "";
      }
      // If a single token is wider than maxWidth, break character by character
      if (ctx.measureText(token).width > maxWidth) {
        let charBuf = "";
        for (const ch of Array.from(token)) {
          if (ctx.measureText(charBuf + ch).width <= maxWidth) {
            charBuf += ch;
          } else {
            if (charBuf) lines.push(charBuf);
            charBuf = ch;
          }
        }
        current = charBuf;
      } else {
        current = token.trimStart();
      }
    }
  }
  if (current.trim()) {
    lines.push(current.trim());
  }
  if (lines.length === 0) lines.push(raw);
  ctx.restore();

  return {
    lines,
    font,
    lineHeight,
    height: lines.length * lineHeight
  };
}

function ellipsizeText(ctx, text, maxWidth, font) {
  ctx.save();
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.restore();
    return text;
  }
  const ellipsis = "…";
  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = chars.slice(0, mid).join("") + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  ctx.restore();
  return chars.slice(0, low).join("") + ellipsis;
}

function drawWrappedLayout(ctx, layout, x, y, color) {
  ctx.save();
  ctx.font = layout.font;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  layout.lines.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * layout.lineHeight);
  });
  ctx.restore();
}

function drawAvatar(ctx, name, cx, cy, radius, helpers) {
  const color = helpers.avatarColorFor(name);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.font = makeFont(700, Math.round(radius * 0.92));
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(helpers.initialOf(name), cx, cy + 1);
  ctx.restore();
}

async function renderSummaryCanvas({
  tripName,
  members,
  expenses,
  balances,
  settlements,
  totalAmount,
  totalHeadcount,
  helpers
}) {
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {
      // Ignore font load errors
    }
  }

  const measureCanvas = document.createElement("canvas");
  const mCtx = measureCanvas.getContext("2d");

  const safeTripName = (tripName || "").trim() || "ทริปท่องเที่ยว";
  const titleFont = makeFont(700, 54);
  const titleLayout = wrapTextLines(mCtx, safeTripName, CONTENT_WIDTH, titleFont, 64);

  const totalFont = makeFont(700, 90);
  const totalText = `฿${helpers.formatAmount(totalAmount)}`;
  const totalLayout = wrapTextLines(mCtx, totalText, CONTENT_WIDTH, totalFont, 98);

  const statPills = [
    `${totalHeadcount} คนหาร`,
    `${expenses.length} รายการ`
  ];
  if (totalHeadcount > 0 && totalAmount > 0) {
    statPills.push(`เฉลี่ย ~฿${helpers.formatAmount(totalAmount / totalHeadcount)}/คน`);
  }

  const heroHeight =
    44 + 46 + 20 + titleLayout.height + 24 + 2 + 22 + 36 + totalLayout.height + 24 + 48 + 44;

  // Measure Settlements
  const transferTitleFont = makeFont(700, 36);
  const transferAmtFont = makeFont(700, 42);

  const transferLayouts = settlements.map((transfer) => {
    const amtText = `฿${helpers.formatAmount(transfer.amount)}`;
    mCtx.font = transferAmtFont;
    const amtWidth = mCtx.measureText(amtText).width;
    const avatarsBlockW = 54 + 44 + 54 + 20;
    const innerWidth = CONTENT_WIDTH - 56;
    const textWidth = Math.max(180, innerWidth - avatarsBlockW - amtWidth - 20);
    const lineText = `${transfer.fromMember.name} โอนให้ ${transfer.toMember.name}`;
    const tLayout = wrapTextLines(mCtx, lineText, textWidth, transferTitleFont, 44);
    const rawPp = (transfer.toMember.promptPay || "").trim();
    const promptPayText = rawPp ? `พร้อมเพย์  ${helpers.formatPromptPay(rawPp)}` : null;
    const topBlockH = Math.max(54, tLayout.height);
    const ppBlockH = promptPayText ? 14 + 46 : 0;
    const rowH = 26 + topBlockH + ppBlockH + 26;
    return {
      transfer,
      height: rowH,
      titleLayout: tLayout,
      amountText: amtText,
      amountWidth: amtWidth,
      promptPayText
    };
  });

  // Measure Balances
  const balNameFont = makeFont(600, 36);
  const badgeFont = makeFont(700, 30);

  const balanceLayouts = balances.map((bal) => {
    let badgeText = "สมดุล";
    let badgeBg = "#F1F5F9";
    let badgeFg = "#64748B";
    if (bal.netBalance > 0.01) {
      badgeText = `ได้คืน +฿${helpers.formatAmount(bal.netBalance)}`;
      badgeBg = "#ECFDF5";
      badgeFg = "#059669";
    } else if (bal.netBalance < -0.01) {
      badgeText = `โอนเพิ่ม ฿${helpers.formatAmount(-bal.netBalance)}`;
      badgeBg = "#FFF7ED";
      badgeFg = "#EA580C";
    }
    mCtx.font = badgeFont;
    const badgeWidth = mCtx.measureText(badgeText).width + 38;
    const nameAvailableW = Math.max(180, CONTENT_WIDTH - 56 - 20 - badgeWidth - 20);
    const displayName =
      bal.member.headcount > 1
        ? `${bal.member.name} (${bal.member.headcount} คน)`
        : bal.member.name;
    const nLayout = wrapTextLines(mCtx, displayName, nameAvailableW, balNameFont, 44);
    const subText = `จ่าย ฿${helpers.formatAmount(bal.totalPaid)} · หาร ฿${helpers.formatAmount(bal.actualCost)}`;
    const rowH = Math.max(58, nLayout.height + 6 + 36) + 28;
    return {
      balance: bal,
      height: rowH,
      nameLayout: nLayout,
      subText,
      badgeText,
      badgeBg,
      badgeFg,
      badgeWidth
    };
  });

  // Measure Expenses
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const expTitleFont = makeFont(500, 34);
  const expAmtFont = makeFont(700, 34);
  const visibleExpenses = expenses.slice(0, MAX_EXPENSE_ROWS);

  const expenseLayouts = visibleExpenses.map((exp) => {
    const amtText = `฿${helpers.formatAmount(exp.amount)}`;
    mCtx.font = expAmtFont;
    const amtW = mCtx.measureText(amtText).width;
    const availW = Math.max(200, CONTENT_WIDTH - 28 - 18 - amtW - 20);
    const tLayout = wrapTextLines(
      mCtx,
      helpers.displayTitle(exp.title),
      availW,
      expTitleFont,
      42
    );
    const payerName = memberMap.get(exp.payerId)?.name || "ไม่ทราบ";
    const partLabel =
      members.length > 0 && exp.participantIds.length === members.length
        ? `ทุกคน (${members.length})`
        : exp.participantIds
            .map((id) => memberMap.get(id)?.name)
            .filter(Boolean)
            .join(", ");
    const subText = `${payerName} จ่าย · หาร ${partLabel}`;
    const rowH = Math.max(tLayout.height + 6 + 32, 68) + 20;
    return {
      titleLayout: tLayout,
      subText,
      amountText: amtText,
      dotColor: helpers.categoryStyleFor(exp.title).color,
      height: rowH
    };
  });

  // Compute total height
  let y = OUTER_PAD + heroHeight;
  y += 38 + 50 + 22;
  if (transferLayouts.length === 0) {
    y += 90;
  } else {
    y +=
      transferLayouts.reduce((acc, r) => acc + r.height, 0) +
      (transferLayouts.length - 1) * 16;
  }
  y += 34;

  if (balanceLayouts.length > 0) {
    y += 2 + 34 + 50 + 16;
    y += balanceLayouts.reduce((acc, r) => acc + r.height, 0);
    y += 24;
  }

  if (expenseLayouts.length > 0) {
    y += 2 + 34 + 50 + 16;
    y += expenseLayouts.reduce((acc, r) => acc + r.height, 0);
    if (expenses.length > MAX_EXPENSE_ROWS) {
      y += 46;
    }
    y += 20;
  }

  y += 2 + 28 + 36 + 36;
  const totalHeight = Math.ceil(y + OUTER_PAD);

  // Create actual canvas and draw
  const canvas = document.createElement("canvas");
  canvas.width = IMG_WIDTH;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");

  const cardBottom = totalHeight - OUTER_PAD;
  ctx.fillStyle = "#EFF3F8";
  ctx.fillRect(0, 0, IMG_WIDTH, totalHeight);

  // Card drop shadow
  fillRoundRect(
    ctx,
    CARD_LEFT,
    OUTER_PAD + 8,
    CARD_WIDTH,
    cardBottom - OUTER_PAD + 4,
    CARD_RADIUS,
    "rgba(30, 41, 59, 0.09)"
  );

  // Clip to rounded card
  ctx.save();
  roundRectPath(ctx, CARD_LEFT, OUTER_PAD, CARD_WIDTH, cardBottom - OUTER_PAD, CARD_RADIUS);
  ctx.clip();

  // White card background
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(CARD_LEFT, OUTER_PAD, CARD_WIDTH, cardBottom - OUTER_PAD);

  // 1. Hero Header
  const heroBottom = OUTER_PAD + heroHeight;
  drawHeroSection(ctx, {
    top: OUTER_PAD,
    bottom: heroBottom,
    titleLayout,
    totalLayout,
    statPills,
    helpers
  });

  let curY = heroBottom + 38;

  // 2. Settlements Section
  curY = drawSectionHeader(ctx, {
    y: curY,
    accentColor: "#10B981",
    title: "สรุปการโอนเงิน",
    rightBadge: settlements.length > 0 ? `${settlements.length} รายการโอน` : null,
    rightBadgeBg: "#ECFDF5",
    rightBadgeFg: "#059669"
  });
  curY += 22;

  if (transferLayouts.length === 0) {
    fillRoundRect(ctx, CONTENT_LEFT, curY, CONTENT_WIDTH, 90, 24, "#ECFDF5");
    strokeRoundRect(ctx, CONTENT_LEFT, curY, CONTENT_WIDTH, 90, 24, "#A7F3D0", 2);
    ctx.save();
    ctx.font = makeFont(600, 34);
    ctx.fillStyle = "#047857";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ยอดสมดุลแล้ว ไม่ต้องโอนเงินเพิ่มเติม", IMG_WIDTH / 2, curY + 45);
    ctx.restore();
    curY += 90;
  } else {
    transferLayouts.forEach((row, idx) => {
      drawTransferRow(ctx, row, curY, helpers);
      curY += row.height;
      if (idx < transferLayouts.length - 1) curY += 16;
    });
  }
  curY += 34;

  // 3. Balances Section
  if (balanceLayouts.length > 0) {
    drawDivider(ctx, curY, "#E2E8F0");
    curY += 2 + 34;
    curY = drawSectionHeader(ctx, {
      y: curY,
      accentColor: "#4F46E5",
      title: "รายละเอียดรายคน",
      rightBadge: `${balances.length} คน/กลุ่ม`,
      rightBadgeBg: "#EEF2FF",
      rightBadgeFg: "#4F46E5"
    });
    curY += 16;

    balanceLayouts.forEach((row, idx) => {
      drawBalanceRow(ctx, row, curY, idx === balanceLayouts.length - 1, helpers);
      curY += row.height;
    });
    curY += 24;
  }

  // 4. Expenses Section
  if (expenseLayouts.length > 0) {
    drawDivider(ctx, curY, "#E2E8F0");
    curY += 2 + 34;
    curY = drawSectionHeader(ctx, {
      y: curY,
      accentColor: "#F59E0B",
      title: `รายการค่าใช้จ่าย (${expenses.length})`,
      rightBadge: null
    });
    curY += 16;

    expenseLayouts.forEach((row, idx) => {
      const isLast =
        idx === expenseLayouts.length - 1 && expenses.length <= MAX_EXPENSE_ROWS;
      drawExpenseRow(ctx, row, curY, isLast);
      curY += row.height;
    });

    if (expenses.length > MAX_EXPENSE_ROWS) {
      ctx.save();
      ctx.font = makeFont(500, 30);
      ctx.fillStyle = "#64748B";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(
        `และอีก ${expenses.length - MAX_EXPENSE_ROWS} รายการ...`,
        IMG_WIDTH / 2,
        curY + 6
      );
      ctx.restore();
      curY += 46;
    }
    curY += 20;
  }

  // 5. Footer
  drawDivider(ctx, curY, "#E2E8F0");
  curY += 2 + 28;
  ctx.save();
  ctx.font = makeFont(500, 28);
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(
    `Trip Expense Calculator  •  ${helpers.formatThaiDate(Date.now())}`,
    IMG_WIDTH / 2,
    curY
  );
  ctx.restore();

  ctx.restore(); // End card clip

  // Outer crisp card outline
  strokeRoundRect(
    ctx,
    CARD_LEFT,
    OUTER_PAD,
    CARD_WIDTH,
    cardBottom - OUTER_PAD,
    CARD_RADIUS,
    "#E2E8F0",
    2
  );

  return canvas;
}

function drawDivider(ctx, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CONTENT_LEFT, y);
  ctx.lineTo(CONTENT_RIGHT, y);
  ctx.stroke();
  ctx.restore();
}

function drawHeroSection(ctx, { top, bottom, titleLayout, totalLayout, statPills, helpers }) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(CARD_LEFT, top, CARD_WIDTH, bottom - top);
  ctx.clip();

  const grad = ctx.createLinearGradient(CARD_LEFT, top, CARD_RIGHT, bottom);
  grad.addColorStop(0, "#1E1B4B");
  grad.addColorStop(0.55, "#4338CA");
  grad.addColorStop(1, "#7C3AED");
  ctx.fillStyle = grad;
  ctx.fillRect(CARD_LEFT, top, CARD_WIDTH, bottom - top);

  // Subtle radial glow
  const glowX = CARD_RIGHT - 60;
  const glowY = top + 30;
  const glowRadius = CARD_WIDTH * 0.65;
  const radial = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
  radial.addColorStop(0, "rgba(20, 184, 166, 0.5)");
  radial.addColorStop(1, "rgba(20, 184, 166, 0)");
  ctx.fillStyle = radial;
  ctx.beginPath();
  ctx.arc(glowX, glowY, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.beginPath();
  ctx.arc(CARD_LEFT + 70, bottom - 10, CARD_WIDTH * 0.28, 0, Math.PI * 2);
  ctx.fill();

  let y = top + 44;

  // Top-left tag pill + top-right date
  const tagFont = makeFont(600, 28);
  ctx.font = tagFont;
  const tagText = "สรุปค่าใช้จ่ายทริป";
  const tagW = ctx.measureText(tagText).width + 38;
  fillRoundRect(ctx, CONTENT_LEFT, y, tagW, 46, 23, "rgba(255, 255, 255, 0.18)");
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(tagText, CONTENT_LEFT + 19, y + 23);

  ctx.font = makeFont(500, 28);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.textAlign = "right";
  ctx.fillText(helpers.formatThaiDate(Date.now()), CONTENT_RIGHT, y + 23);

  y += 46 + 20;

  // Trip Name
  drawWrappedLayout(ctx, titleLayout, CONTENT_LEFT, y, "#FFFFFF");
  y += titleLayout.height + 24;

  // Subtle white divider
  drawDivider(ctx, y, "rgba(255, 255, 255, 0.22)");
  y += 2 + 22;

  // Total label & amount
  ctx.font = makeFont(500, 30);
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("ยอดค่าใช้จ่ายรวมทั้งหมด", CONTENT_LEFT, y);
  y += 36;

  drawWrappedLayout(ctx, totalLayout, CONTENT_LEFT, y, "#FFFFFF");
  y += totalLayout.height + 24;

  // Stat pills row
  const pillFont = makeFont(600, 28);
  ctx.font = pillFont;
  let px = CONTENT_LEFT;
  for (const pill of statPills) {
    const pw = ctx.measureText(pill).width + 34;
    if (px + pw <= CONTENT_RIGHT) {
      fillRoundRect(ctx, px, y, pw, 48, 24, "rgba(255, 255, 255, 0.15)");
      ctx.fillStyle = "#FFFFFF";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(pill, px + 17, y + 24);
      px += pw + 14;
    }
  }

  ctx.restore();
}

function drawSectionHeader(ctx, { y, accentColor, title, rightBadge, rightBadgeBg, rightBadgeFg }) {
  fillRoundRect(ctx, CONTENT_LEFT, y + 6, 10, 38, 5, accentColor);

  ctx.save();
  ctx.font = makeFont(700, 42);
  ctx.fillStyle = "#0F172A";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(title, CONTENT_LEFT + 24, y + 25);

  if (rightBadge) {
    ctx.font = makeFont(600, 28);
    const bw = ctx.measureText(rightBadge).width + 30;
    const bx = CONTENT_RIGHT - bw;
    fillRoundRect(ctx, bx, y + 3, bw, 44, 22, rightBadgeBg);
    ctx.fillStyle = rightBadgeFg;
    ctx.textAlign = "center";
    ctx.fillText(rightBadge, bx + bw / 2, y + 25);
  }
  ctx.restore();
  return y + 50;
}

function drawTransferRow(ctx, row, y, helpers) {
  fillRoundRect(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, row.height, 26, "#F8FAFC");
  strokeRoundRect(ctx, CONTENT_LEFT, y, CONTENT_WIDTH, row.height, 26, "#E2E8F0", 2);

  const padX = 28;
  const innerTop = y + 26;
  const avatarRadius = 27;
  const fromCx = CONTENT_LEFT + padX + avatarRadius;
  const avatarCy = innerTop + avatarRadius;

  drawAvatar(ctx, row.transfer.fromMember.name, fromCx, avatarCy, avatarRadius, helpers);

  const arrowCx = fromCx + avatarRadius + 22;
  ctx.save();
  ctx.font = makeFont(700, 32);
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("→", arrowCx, avatarCy);
  ctx.restore();

  const toCx = arrowCx + 22 + avatarRadius;
  drawAvatar(ctx, row.transfer.toMember.name, toCx, avatarCy, avatarRadius, helpers);

  const textStartX = toCx + avatarRadius + 20;
  drawWrappedLayout(ctx, row.titleLayout, textStartX, innerTop + 5, "#0F172A");

  ctx.save();
  ctx.font = makeFont(700, 42);
  ctx.fillStyle = "#4F46E5";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(row.amountText, CONTENT_RIGHT - padX, avatarCy);
  ctx.restore();

  if (row.promptPayText) {
    const ppTop = innerTop + Math.max(54, row.titleLayout.height) + 14;
    const ppFont = makeFont(600, 30);
    const maxTextW = Math.max(100, CONTENT_RIGHT - padX - textStartX - 32);
    const clippedPp = ellipsizeText(ctx, row.promptPayText, maxTextW, ppFont);
    ctx.save();
    ctx.font = ppFont;
    const ppW = Math.min(ctx.measureText(clippedPp).width + 32, CONTENT_RIGHT - padX - textStartX);
    fillRoundRect(ctx, textStartX, ppTop, ppW, 46, 14, "#EEF2FF");
    ctx.fillStyle = "#4338CA";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(clippedPp, textStartX + 16, ppTop + 23);
    ctx.restore();
  }
}

function drawBalanceRow(ctx, row, y, isLast, helpers) {
  const topPad = 14;
  const cy = y + topPad + 28;
  const avatarR = 28;
  drawAvatar(ctx, row.balance.member.name, CONTENT_LEFT + avatarR, cy, avatarR, helpers);

  const textX = CONTENT_LEFT + avatarR * 2 + 20;
  drawWrappedLayout(ctx, row.nameLayout, textX, y + topPad, "#0F172A");

  const subFont = makeFont(400, 30);
  const maxSubW = Math.max(120, CONTENT_RIGHT - row.badgeWidth - 20 - textX);
  const clippedSub = ellipsizeText(ctx, row.subText, maxSubW, subFont);
  ctx.save();
  ctx.font = subFont;
  ctx.fillStyle = "#64748B";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(clippedSub, textX, y + topPad + row.nameLayout.height + 6);
  ctx.restore();

  // Right badge
  const badgeH = 48;
  const badgeTop = cy - badgeH / 2;
  const badgeLeft = CONTENT_RIGHT - row.badgeWidth;
  fillRoundRect(ctx, badgeLeft, badgeTop, row.badgeWidth, badgeH, 24, row.badgeBg);

  ctx.save();
  ctx.font = makeFont(700, 30);
  ctx.fillStyle = row.badgeFg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(row.badgeText, badgeLeft + row.badgeWidth / 2, badgeTop + badgeH / 2 + 1);
  ctx.restore();

  if (!isLast) {
    drawDivider(ctx, y + row.height - 1, "#F1F5F9");
  }
}

function drawExpenseRow(ctx, row, y, isLast) {
  const topPad = 10;
  const dotR = 9;
  const dotCx = CONTENT_LEFT + dotR + 4;
  const dotCy = y + topPad + 20;

  ctx.save();
  ctx.beginPath();
  ctx.arc(dotCx, dotCy, dotR, 0, Math.PI * 2);
  ctx.fillStyle = row.dotColor;
  ctx.fill();
  ctx.restore();

  const textX = CONTENT_LEFT + 32;
  drawWrappedLayout(ctx, row.titleLayout, textX, y + topPad, "#1E293B");

  const amtFont = makeFont(700, 34);
  ctx.save();
  ctx.font = amtFont;
  ctx.fillStyle = "#334155";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText(row.amountText, CONTENT_RIGHT, y + topPad + 2);
  const amtW = ctx.measureText(row.amountText).width;
  ctx.restore();

  const subFont = makeFont(400, 28);
  const maxSubW = Math.max(120, CONTENT_RIGHT - amtW - 20 - textX);
  const clippedSub = ellipsizeText(ctx, row.subText, maxSubW, subFont);
  ctx.save();
  ctx.font = subFont;
  ctx.fillStyle = "#64748B";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(clippedSub, textX, y + topPad + row.titleLayout.height + 6);
  ctx.restore();

  if (!isLast) {
    drawDivider(ctx, y + row.height - 1, "#F1F5F9");
  }
}

window.renderSummaryCanvas = renderSummaryCanvas;

