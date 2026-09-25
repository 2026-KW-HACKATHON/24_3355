// 공통 휴대폰 크롬(상태바·사파리 막대·탭바)과 3D 자리표시를 그린다.
// 사용: <div class="phone" data-tabs="resident:building" data-safari="on|off">
(function () {
  const TABS = {
    resident: [
      ["building", "building-2", "우리 건물"],
      ["sent", "send", "보낸 내용"],
      ["me", "user-round", "내 정보"],
    ],
    landlord: [
      ["manage", "layout-grid", "건물 관리"],
      ["inbox", "inbox", "받은 내용"],
      ["settings", "settings", "설정"],
    ],
  };

  function statusbar(dark) {
    return `<div class="statusbar" style="${dark ? "color:#fff" : ""}"><span>9:41</span>
      <span class="sys"><i data-lucide="signal"></i><i data-lucide="wifi"></i><span class="batt"></span></span></div>`;
  }
  function safari() {
    return `<div class="safari"><div class="url"><i data-lucide="lock"></i>wolgye.kr</div></div>`;
  }
  function tabbar(spec) {
    const [set, active, dot] = spec.split(":");
    return `<nav class="tabbar">${TABS[set]
      .map(([k, ic, label]) => `<div class="tab ${k === active ? "on" : ""}"><span class="${k === dot ? "dot" : ""}"><i data-lucide="${ic}"></i></span>${label}</div>`)
      .join("")}</nav>`;
  }

  // 등각 투영 도시 (lofi 3D 자리표시)
  function city(el) {
    const W = el.clientWidth, H = el.clientHeight;
    const s = +el.dataset.scale || 15;
    const ox = W / 2 + (+el.dataset.ox || 0), oy = H * (+el.dataset.oy || 0.42);
    const cx = Math.cos(Math.PI / 6) * s, cy = Math.sin(Math.PI / 6) * s;
    const P = (i, j, z) => [ox + (i - j) * cx, oy + (i + j) * cy - z * s];
    const poly = (pts, fill, stroke) => `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${fill}" stroke="${stroke || "none"}" stroke-width="1" stroke-linejoin="round"/>`;
    function box(i, j, w, d, h, c) {
      const top = [P(i, j, h), P(i + w, j, h), P(i + w, j + d, h), P(i, j + d, h)];
      const left = [P(i, j + d, 0), P(i + w, j + d, 0), P(i + w, j + d, h), P(i, j + d, h)];
      const right = [P(i + w, j, 0), P(i + w, j + d, 0), P(i + w, j + d, h), P(i + w, j, h)];
      let out = poly(left, c[1], c[3]) + poly(right, c[2], c[3]) + poly(top, c[0], c[3]);
      if (c.windows) {
        for (let f = 1; f < h; f += 1.1) {
          for (let k = 0.5; k < w - 0.4; k += 1.1) {
            const a = P(i + k, j + d, f), b = P(i + k + 0.55, j + d, f), bb = P(i + k + 0.55, j + d, f + 0.55), aa = P(i + k, j + d, f + 0.55);
            out += poly([a, b, bb, aa], c.windows);
          }
          for (let k = 0.5; k < d - 0.4; k += 1.1) {
            const a = P(i + w, j + k, f), b = P(i + w, j + k + 0.55, f), bb = P(i + w, j + k + 0.55, f + 0.55), aa = P(i + w, j + k, f + 0.55);
            out += poly([a, b, bb, aa], c.windows2 || c.windows);
          }
        }
      }
      return { svg: out, depth: i + j + w + d };
    }
    const G = ["#f4f5f7", "#dfe2e6", "#e9ebee", "rgba(0,0,0,.04)"];
    const G2 = ["#eceef1", "#d3d7dc", "#dfe2e6", "rgba(0,0,0,.04)"];
    const HL = Object.assign(["#3d5286", "#1c2945", "#25355a", "none"], { windows: "#f6efe1", windows2: "#c9a45c" });
    const items = [];
    // 도로(바닥)
    const ground = poly([P(-9, -9, 0), P(9, -9, 0), P(9, 9, 0), P(-9, 9, 0)], "#eef0f2");
    const road1 = poly([P(-9, 2.2, 0), P(9, 2.2, 0), P(9, 3.8, 0), P(-9, 3.8, 0)], "#ffffff");
    const road2 = poly([P(2.2, -9, 0), P(3.8, -9, 0), P(3.8, 9, 0), P(2.2, 9, 0)], "#ffffff");
    const blocks = [
      [-7, -7, 3, 3, 4, G], [-3.4, -7, 2.6, 3, 2.6, G2], [-7, -3.4, 3, 2.6, 3, G2], [4.4, -7, 3, 3, 5, G],
      [4.4, -3.4, 2.6, 2.4, 2.4, G2], [-7, 4.4, 3, 3, 2.2, G], [4.4, 4.4, 2.8, 3, 3.4, G2], [0.4, 4.4, 1.4, 2.6, 2.6, G],
      [-3.4, 4.4, 2.6, 2.6, 3.6, G2], [0.2, -7, 1.6, 3, 3.2, G2],
    ];
    blocks.forEach((b) => items.push(box(...b)));
    const hl = box(-3.2, -3.2, 4.4, 4.4, 4, HL);
    items.push(hl);
    items.sort((a, b) => a.depth - b.depth);
    // 강조 건물 위 표지
    const [px, py] = P(-1, -1, 4);
    const tag = el.dataset.tag || "햇살빌라";
    const pin = `<g transform="translate(${px},${py - 14})">
      <rect x="${-tag.length * 7 - 14}" y="-40" width="${tag.length * 14 + 28}" height="30" rx="15" fill="#fff" stroke="#e5e8eb"/>
      <text x="0" y="-20" text-anchor="middle" font-size="14" font-weight="700" fill="#191f28" font-family="Pretendard Variable, sans-serif">${tag}</text>
      <path d="M-6 -10 L0 -2 L6 -10 Z" fill="#fff" stroke="#e5e8eb"/><path d="M-5 -11 L5 -11" stroke="#fff" stroke-width="2"/>
    </g>`;
    el.insertAdjacentHTML(
      "afterbegin",
      `<svg class="city" viewBox="0 0 ${W} ${H}" aria-hidden="true">${ground}${road1}${road2}${items.map((x) => x.svg).join("")}${el.dataset.pin === "off" ? "" : pin}</svg>`
    );
  }

  const KB = {
    en: [["Q","W","E","R","T","Y","U","I","O","P"],["A","S","D","F","G","H","J","K","L"],["Z","X","C","V","B","N","M"]],
    ko: [["ㅂ","ㅈ","ㄷ","ㄱ","ㅅ","ㅛ","ㅕ","ㅑ","ㅐ","ㅔ"],["ㅁ","ㄴ","ㅇ","ㄹ","ㅎ","ㅗ","ㅓ","ㅏ","ㅣ"],["ㅋ","ㅌ","ㅊ","ㅍ","ㅠ","ㅜ","ㅡ"]],
  };
  function keyboard(lang) {
    const [r1, r2, r3] = KB[lang];
    const keys = (r) => r.map((k) => `<span class="k">${k}</span>`).join("");
    return `<div class="kb"><div class="acc"><span class="arrows"><i data-lucide="chevron-up"></i><i data-lucide="chevron-down"></i></span><span style="font-weight:600">완료</span></div>
      <div class="rows"><div class="row">${keys(r1)}</div><div class="row">${keys(r2)}</div>
      <div class="row"><span class="k fn"><i data-lucide="arrow-big-up"></i></span><span style="width:6px"></span>${keys(r3)}<span style="width:6px"></span><span class="k fn"><i data-lucide="delete"></i></span></div>
      <div class="row"><span class="k fn" style="flex-basis:88px">123</span><span class="k wide">${lang === "ko" ? "스페이스" : "space"}</span><span class="k ret">${lang === "ko" ? "줄바꿈" : "return"}</span></div></div></div>`;
  }
  function qr(el) {
    const n = 25, c = el.clientWidth / n;
    let seed = 7, out = "";
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const finder = (x, y) => `<rect x="${x*c}" y="${y*c}" width="${7*c}" height="${7*c}" rx="${c}" fill="#1c2945"/><rect x="${(x+1)*c}" y="${(y+1)*c}" width="${5*c}" height="${5*c}" rx="${c*.6}" fill="#fff"/><rect x="${(x+2)*c}" y="${(y+2)*c}" width="${3*c}" height="${3*c}" rx="${c*.5}" fill="#1c2945"/>`;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const inF = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (!inF && rnd() > 0.52) out += `<rect x="${x*c+c*.1}" y="${y*c+c*.1}" width="${c*.8}" height="${c*.8}" rx="${c*.25}" fill="#1c2945" opacity=".85"/>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${n*c} ${n*c}" width="100%" height="100%" aria-hidden="true">${out}${finder(0,0)}${finder(n-7,0)}${finder(0,n-7)}</svg>`;
  }

  document.querySelectorAll(".phone").forEach((ph) => {
    if (ph.dataset.kb) {
      ph.classList.add("kb-open");
      ph.insertAdjacentHTML("beforeend", keyboard(ph.dataset.kb));
    }
    if (ph.dataset.bare === "on") return;
    ph.insertAdjacentHTML("afterbegin", statusbar(ph.dataset.statusDark === "on"));
    if (ph.dataset.tabs) {
      ph.classList.add("with-tab");
      ph.insertAdjacentHTML("beforeend", tabbar(ph.dataset.tabs));
    }
    if (ph.dataset.safari !== "off" && !ph.dataset.kb) ph.insertAdjacentHTML("beforeend", safari());
    ph.insertAdjacentHTML("beforeend", `<div class="home-ind"></div>`);
  });
  // 시트 배경으로 쓸 때 (#quiet) 진행 중 표시를 숨김
  if (location.hash === "#quiet") document.querySelectorAll("[data-quiet-hide]").forEach((el) => el.remove());
  document.querySelectorAll(".scene[data-city]").forEach(city);
  document.querySelectorAll("[data-qr]").forEach(qr);
  if (window.lucide) lucide.createIcons({ attrs: { "stroke-width": 2 } });
  document.documentElement.dataset.ready = "1";
})();
