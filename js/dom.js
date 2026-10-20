// Tiny DOM helpers. Text is always added as text nodes (never innerHTML),
// so question content can never inject markup.

/**
 * h("button", { class: "btn", onclick: fn, "aria-label": "x" }, "Label", otherNode)
 * Children can be strings, numbers, nodes, arrays, or null/false (skipped).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && key !== "list" && key !== "style") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replace everything inside `el` with `children`. */
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export function plural(n, one, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}
