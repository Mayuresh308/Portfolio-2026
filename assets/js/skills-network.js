// Skills "neural network": draws SVG edges between the HTML nodes rendered by the
// resume-skills block override, and handles the hover/focus highlight.
(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PULSE_MS = 800;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const curve = (x1, y1, x2, y2) => {
    const dx = (x2 - x1) / 2;
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };

  const el = (name, attrs) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const init = (root) => {
    const svg = root.querySelector(".skills-net__edges");
    const center = root.querySelector(".net-center");
    const groups = [...root.querySelectorAll(".net-group")];
    let active = null;
    let pulseFrame = 0;

    const edgeGroup = (id) => svg.querySelector(`.net-edges-g[data-net-group="${id}"]`);

    const draw = () => {
      svg.replaceChildren();
      const box = root.getBoundingClientRect();
      if (!box.width || getComputedStyle(root).display === "none") return;
      svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
      const c = center.getBoundingClientRect();
      const cy = c.top + c.height / 2 - box.top;

      for (const group of groups) {
        const left = group.closest(".skills-net__side--left") !== null;
        const cat = group.querySelector(".net-cat").getBoundingClientRect();
        const catY = cat.top + cat.height / 2 - box.top;
        const g = el("g", { class: "net-edges-g", "data-net-group": group.dataset.netGroup, style: group.getAttribute("style") || "" });

        // centre -> category (neutral)
        const tx1 = (left ? c.left : c.right) - box.left;
        const tx2 = (left ? cat.right : cat.left) - box.left;
        g.append(el("path", { class: "net-edge net-edge--trunk", d: curve(tx1, cy, tx2, catY) }));
        g.append(el("circle", { class: "net-end net-end--trunk", cx: tx2, cy: catY, r: 2.5 }));

        // category -> each skill (category colour), ending on the skill's underline
        const lx1 = (left ? cat.left : cat.right) - box.left;
        for (const skill of group.querySelectorAll(".net-skill__label")) {
          // end on the last line of the label (labels may wrap at narrower desktop widths)
          const lines = skill.getClientRects();
          const s = lines[lines.length - 1];
          const sx = (left ? s.right : s.left) - box.left;
          const sy = s.bottom - 1 - box.top;
          g.append(el("path", { class: "net-edge net-edge--leaf", d: curve(lx1, catY, sx, sy) }));
          g.append(el("circle", { class: "net-end net-end--leaf", cx: sx, cy: sy, r: 2.5 }));
        }
        svg.append(g);
      }
      if (active !== null) edgeGroup(active)?.classList.add("is-active");
    };

    const pulse = (id) => {
      cancelAnimationFrame(pulseFrame);
      svg.querySelectorAll(".net-pulse").forEach((p) => p.remove());
      if (reducedMotion.matches) return;
      const g = edgeGroup(id);
      if (!g) return;
      const trunk = g.querySelector(".net-edge--trunk");
      const leaves = [...g.querySelectorAll(".net-edge--leaf")];
      const dots = [trunk, ...leaves].map((path) => {
        const dot = el("circle", { class: "net-pulse", r: 3.5, cx: -10, cy: -10 });
        g.append(dot);
        return { path, dot, len: path.getTotalLength() };
      });
      const start = performance.now();
      const half = PULSE_MS / 2;
      const step = (now) => {
        const t = now - start;
        dots.forEach(({ path, dot, len }, i) => {
          // trunk runs in the first half, leaves in the second
          const local = i === 0 ? t / half : (t - half) / half;
          if (local < 0 || local > 1) { dot.setAttribute("opacity", "0"); return; }
          const pt = path.getPointAtLength(len * local);
          dot.setAttribute("cx", pt.x);
          dot.setAttribute("cy", pt.y);
          dot.setAttribute("opacity", "1");
        });
        if (t < PULSE_MS) pulseFrame = requestAnimationFrame(step);
        else dots.forEach(({ dot }) => dot.remove());
      };
      pulseFrame = requestAnimationFrame(step);
    };

    const activate = (group) => {
      const id = group.dataset.netGroup;
      if (active === id) return;
      clear();
      active = id;
      root.classList.add("is-focus");
      group.classList.add("is-active");
      edgeGroup(id)?.classList.add("is-active");
      pulse(id);
    };

    const clear = () => {
      active = null;
      root.classList.remove("is-focus");
      root.querySelectorAll(".is-active").forEach((n) => n.classList.remove("is-active"));
      cancelAnimationFrame(pulseFrame);
      svg.querySelectorAll(".net-pulse").forEach((p) => p.remove());
    };

    for (const group of groups) {
      group.addEventListener("mouseenter", () => activate(group));
      group.addEventListener("mouseleave", () => { if (!group.contains(document.activeElement)) clear(); });
      group.addEventListener("focusin", () => activate(group));
      group.addEventListener("focusout", (e) => { if (!group.contains(e.relatedTarget)) clear(); });
    }

    new ResizeObserver(draw).observe(root);
    document.fonts?.ready.then(draw);
    window.addEventListener("load", draw);
    draw();
  };

  const start = () => document.querySelectorAll("[data-skills-net]").forEach(init);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
