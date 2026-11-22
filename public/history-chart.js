const namespace = "http://www.w3.org/2000/svg";
const compact = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 });

export function chartValues(item, metric, missed) {
  const { count, done, planned, earned } = item.totals;
  if (item.status === "missing" || item.status === "partial") return null;
  if (metric === "rate") return count ? [100, 100 * (missed ? count - done : done) / count] : null;
  if (metric === "meso") return [planned, missed ? planned - earned : earned];
  return [count, missed ? count - done : done];
}

function svg(name, attributes, content) {
  const node = document.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (content != null) node.textContent = content;
  return node;
}

export function historyChart(periods, { metric, missed, display, selected, periodButton, el }) {
  const values = periods.map((item) => chartValues(item, metric, missed));
  const width = Math.max(590, 52 + periods.length * 90);
  const height = 192;
  const left = 48;
  const top = 15;
  const bottom = height - 15;
  const column = (width - left) / periods.length;
  const center = (i) => left + column * (i + 0.5);
  const peak = Math.max(1, ...values.map((pair) => pair?.[0] ?? 0));
  const yPos = (value) => bottom - (bottom - top) * value / peak;
  const plot = el("div", "", "history-plot");
  plot.style.minWidth = width + "px";
  const chart = svg("svg", {
    viewBox: "0 0 " + width + " " + height, preserveAspectRatio: "none", "aria-hidden": "true",
  });
  const selectedIndex = periods.findIndex((item) => item.key === selected);
  if (selectedIndex >= 0) chart.append(svg("rect", {
    x: center(selectedIndex) - column / 2, y: 0, width: column, height, class: "plot-selected",
  }));
  for (const step of [0, 0.25, 0.5, 0.75, 1]) {
    if (metric === "clears" && peak < 4 && !Number.isInteger(step * peak)) continue;
    const value = peak * step;
    const y = yPos(value);
    chart.append(svg("line", { x1: left, x2: width, y1: y, y2: y, class: "plot-grid" }));
    chart.append(svg("text", { x: left - 7, y: y + 4, "text-anchor": "end", class: "plot-tick" },
      metric === "rate" ? value + "%" : compact.format(value)));
  }
  values.forEach((pair, i) => {
    if (!pair) chart.append(svg("line", {
      x1: center(i) - 9, x2: center(i) + 9, y1: bottom - 4, y2: bottom - 4, class: "plot-gap",
    }));
  });
  for (const measure of [0, 1]) {
    const kind = measure ? "plot-result" : "plot-plan";
    if (display === "bar") {
      const bar = Math.min(38, column * 0.44) * (measure ? 0.63 : 1);
      values.forEach((pair, i) => {
        if (!pair) return;
        const y = yPos(pair[measure]);
        chart.append(svg("rect", { x: center(i) - bar / 2, y, width: bar,
          height: bottom - y, class: kind }));
      });
    } else {
      let path = "";
      let following = false;
      const markers = [];
      values.forEach((pair, i) => {
        if (!pair) {
          following = false;
          return;
        }
        const x = center(i);
        const y = yPos(pair[measure]);
        path += (following ? "L" : "M") + x + "," + y;
        following = true;
        markers.push(svg("circle", { cx: x, cy: y, r: 3.3, class: kind }));
      });
      chart.append(svg("path", { d: path, class: "plot-line " + kind }), ...markers);
    }
  }
  const labels = el("div", "", "history-chart-labels");
  labels.style.setProperty("--plot-left", 100 * left / width + "%");
  labels.style.setProperty("--plot-columns", periods.length);
  for (const [index, item] of periods.entries()) {
    const control = periodButton(item, "plot");
    const pair = values[index];
    const result = pair ? metric === "rate"
      ? pair[1].toFixed(1) + "%" : compact.format(pair[1]) : "–";
    if (pair) control.title += metric === "rate" ? " · " + result :
      " · " + pair[1].toLocaleString("ko-KR") + " / " + pair[0].toLocaleString("ko-KR");
    control.append(el("small", result));
    labels.append(control);
  }
  plot.append(chart, labels);
  return plot;
}
