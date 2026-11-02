const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies = {}, globals = {}) {
  const context = { exports: {}, console, setTimeout, clearTimeout, queueMicrotask, ...globals,
    require: name => name in dependencies ? dependencies[name] : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context);
  return context.exports;
}

// Commit effects only after refs are attached, and preserve hook slots across
// renders. This makes lifecycle tests exercise the component's actual effects.
function hooks() {
  const slots = [], effects = [];
  let cursor = 0, queued = [], updates = 0;
  const jsx = (type, props) => {
    if (type?.context) type.context.current = props.value;
    return { type, props };
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; updates++; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useEffect(setup, deps) {
      const index = cursor++;
      const old = effects[index];
      if (!old || !deps || deps.some((dep, i) => !Object.is(dep, old.deps?.[i]))) {
        queued.push(() => { old?.cleanup?.(); effects[index] = { setup, deps, cleanup: setup() }; });
      }
    },
    useCallback(callback, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    createContext(value) { const context = { current: value }; context.Provider = { context }; return context; },
    useContext(context) { return context.current; },
  };
  return { react, jsx: { jsx, jsxs: jsx },
    get updates() { return updates; },
    render(component, props) { cursor = 0; return component(props); },
    flush() { const work = queued; queued = []; work.forEach(run => run()); },
    replay() { effects.forEach(effect => { effect.cleanup?.(); effect.cleanup = effect.setup(); }); },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}
module.exports = { load, hooks };
