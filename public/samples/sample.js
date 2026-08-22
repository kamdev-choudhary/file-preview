// Syntax highlighting comes from highlight.js, loaded only for code files.
export function debounce(fn, wait = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

class Pipeline {
  #stages = [];
  use(stage) { this.#stages.push(stage); return this; }
  async run(input) {
    let value = input;
    for (const stage of this.#stages) value = await stage(value);
    return value;
  }
}

export default new Pipeline();
