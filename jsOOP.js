(function (Scratch) {
  'use strict';

  // REQUIRE: unsandboxed runtime
  if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
    throw new Error("'JS OOP' extension must run unsandboxed!");
  }

  const vm = Scratch.vm;
  const DEBUG = false;

  // Load jwArray extension if not already loaded
  if (!vm.jwArray) vm.extensionManager.loadExtensionIdSync('jwArray');
  const jwArray = vm.jwArray;

  // Load dogeiscutObject extension if not already loaded
  if (!vm.dogeiscutObject) vm.extensionManager.loadExtensionURL("https://extensions.penguinmod.com/extensions/DogeisCut/dogeiscutObject.js");

  // === BigInt-safe JSON serializer (handles BigInt -> number/string and circular refs) ===
  function safeSerialize(obj) {
    const seen = new WeakSet();
    return JSON.stringify(obj, function (key, value) {
      // Convert BigInt to number if safe, otherwise to string
      if (typeof value === 'bigint') {
        const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
        const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
        if (value >= minSafe && value <= maxSafe) {
          return Number(value);
        } else {
          return value.toString();
        }
      }
      // Handle circular references
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    }, 2);
  }

  // -------------------------
  // ACE editor custom field for code inputs (copied from reference, adapted)
  // -------------------------
  let isScratchBlocksReady = typeof ScratchBlocks === "object";
  const codeEditorHandlers = new Map();
  // we cant have nice things
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  async function runCode(x) {
    return await Object.getPrototypeOf(async function() {}).constructor(x)();
  }

  function initBlockTools() {
    // avoid double-init
    if (typeof ScratchBlocks !== "object") return;

    window.addEventListener("message", (e) => {
      if (e.data?.type === "code-change") {
        const handler = codeEditorHandlers.get(e.data.id);
        if (handler) handler(e.data.value);
      }
    });

    const recyclableDiv = document.createElement("div");
    recyclableDiv.setAttribute("style", `display: flex; justify-content: center; padding-top: 10px; width: 250px; height: 200px;`);

    const fakeDiv = document.createElement("div");
    fakeDiv.setAttribute("style", "background: #272822; border-radius: 10px; border: none; width: 100%; height: calc(100% - 20px);");
    recyclableDiv.appendChild(fakeDiv);

    ScratchBlocks.FieldCustom.registerInput(
      "jsoop-codeEditor",
      recyclableDiv,
      (field) => {
        /* on init */
        const inputObject = field.inputSource;
        const input = inputObject && inputObject.firstChild ? inputObject.firstChild : null;
        const srcBlock = field.sourceBlock_;
        // parent may be missing
        const parent = srcBlock && srcBlock.parentBlock_ ? srcBlock.parentBlock_ : null;

        // compute safe dragCheck guard
        let parentIsInFlyout = false;
        try { parentIsInFlyout = !!(parent && parent.isInFlyout); } catch (e) { parentIsInFlyout = false; }
        let isDraggingClass = false;
        try { isDraggingClass = !!(srcBlock && srcBlock.svgGroup_ && srcBlock.svgGroup_.classList && srcBlock.svgGroup_.classList.contains && srcBlock.svgGroup_.classList.contains("blocklyDragging")); } catch (e) { isDraggingClass = false; }
        const dragCheck = (parentIsInFlyout || isDraggingClass) ? "none" : "all";

        try { if (inputObject && inputObject.setAttribute) inputObject.setAttribute("pointer-events", "none"); } catch (e) {}
        try { if (input) input.style.height = "210px"; } catch (e) {}

        const iframe = document.createElement("iframe");
        iframe.setAttribute("style", `pointer-events: ${dragCheck}; background: #272822; border-radius: 10px; border: none; ${isSafari ? "" : "width: 100%;"} height: calc(100% - 20px);`);
        iframe.setAttribute("sandbox", "allow-scripts");

        const html = `
<!DOCTYPE html>
<html><head>
  <meta charset="utf-8"/>
  <style>html, body, #editor {background: #272822; margin: 0; padding: 0; height: 100%; width: 100%;}</style>
</head>
<body>
  <div id="editor"></div>
  <script src="https://cdn.jsdelivr.net/npm/ace-builds@1.32.3/src-min-noconflict/ace.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/ace-builds@1.32.3/src-min-noconflict/mode-javascript.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/ace-builds@1.32.3/src-min-noconflict/theme-monokai.js"></script>
  <script>
    window.addEventListener("message", function(e) {
      try {
        const editor = ace.edit("editor");
        editor.setOptions({
          fontSize: "15px", showPrintMargin: false,
          highlightActiveLine: true, useWorker: false
        });

        editor.session.setMode("ace/mode/javascript");
        editor.setTheme("ace/theme/monokai");
        editor.setValue(e.data.value || "");
        editor.session.on("change", function() {
          parent.postMessage({
            type: "code-change", id: "${srcBlock?.id}", value: editor.getValue()
          }, "*");
        });
      } catch (err) {
        parent.postMessage({ type: "code-change", id: "${srcBlock?.id}", value: e.data.value || "" }, "*");
      }
    }, { once: true });
  </script>
</body>
</html>`;
        iframe.src = URL.createObjectURL(new Blob([html], { type: "text/html" }));

        // safe replace / append
        try {
          if (input && input.firstChild) input.replaceChild(iframe, input.firstChild);
          else if (input) input.appendChild(iframe);
        } catch (e) {
          try { if (input) input.appendChild(iframe); } catch (e2) {}
        }

        iframe.onload = () => {
          // initialize value (if sentinel) to block-specific defaults like the reference
          try {
            let value = field.getValue();
            if (value === "needsInit-1@#4%^7*(0") {
              // decide default based on block type (field may be used in multiple blocks)
              const myType = (srcBlock && srcBlock.type) || (parent && parent.type) || "";
              // if block is evalJS
              if (typeof myType === "string" && myType.toLowerCase().includes("evaljs")) {
                value = 'return {name: "Alice"}';
              } else if (typeof myType === "string" && myType.toLowerCase().includes("runjs")) {
                value = 'console.log("hi")';
              } else {
                // generic default
                value = '';
              }
              try { field.setValue(value); } catch (e) {}
            }
            if (iframe.contentWindow) iframe.contentWindow.postMessage({ value: field.getValue() }, "*");
          } catch (e) {}
        };

        // listen for code updates
        try {
          if (srcBlock && srcBlock.id) codeEditorHandlers.set(srcBlock.id, (value) => {
            try { field.setValue(value); } catch (e) {}
          });
        } catch (e) {}

        // add resize handle
        const resizeHandle = document.createElement("div");
        resizeHandle.setAttribute("style", `pointer-events: ${dragCheck}; position: absolute; right: 5px; bottom: 15px; width: 12px; height: 12px; background: #ffffff40; cursor: se-resize; border-radius: 0px 0 50px 0;`);
        try { if (input) input.appendChild(resizeHandle); } catch (e) {}

        // active state management
        let isResizing = false;
        let isEditorPointerDown = false;
        let startX, startY, startW, startH;

        function setEditorActive(active) {
          try {
            // if parent is in flyout or block is being dragged, don't allow
            const parentFlyoutNow = !!(parent && parent.isInFlyout);
            const currentlyDragging = !!(srcBlock && srcBlock.svgGroup_ && srcBlock.svgGroup_.classList && srcBlock.svgGroup_.classList.contains && srcBlock.svgGroup_.classList.contains("blocklyDragging"));
            if (parentFlyoutNow || currentlyDragging) active = false;

            iframe.style.pointerEvents = active ? "all" : "none";
            try { if (resizeHandle) resizeHandle.style.pointerEvents = active ? "all" : "none"; } catch (e) {}
            try { if (ScratchBlocks && ScratchBlocks.mainWorkspace) ScratchBlocks.mainWorkspace.allowDragging = !active; } catch (e) {}
            if (parent && typeof parent.setMovable === 'function') {
              try { parent.setMovable(!active); } catch (e) {}
            }
          } catch (e) {}
        }

        // pointer/hover handlers to claim input like reference
        try {
          iframe.addEventListener("mouseenter", () => setEditorActive(true));
          iframe.addEventListener("mouseleave", () => { if (!isEditorPointerDown && !isResizing) setEditorActive(false); });
          iframe.addEventListener("pointerdown", (ev) => {
            isEditorPointerDown = true;
            setEditorActive(true);
            try { ev.stopPropagation(); } catch (e) {}
          });
          document.addEventListener("pointerup", () => {
            if (isEditorPointerDown) {
              isEditorPointerDown = false;
              setTimeout(() => setEditorActive(false), 0);
            }
          });

          // resize handle should also claim pointer input
          resizeHandle.addEventListener("mouseenter", () => setEditorActive(true));
          resizeHandle.addEventListener("mouseleave", () => { if (!isEditorPointerDown && !isResizing) setEditorActive(false); });
          resizeHandle.addEventListener("pointerdown", (ev) => {
            isEditorPointerDown = true;
            setEditorActive(true);
            try { ev.stopPropagation(); } catch (e) {}
          });
        } catch (e) {}

        // resizing
        resizeHandle.addEventListener("mousedown", (e) => {
          // don't allow resize in flyout
          if (parent && parent.isInFlyout) return;
          e.preventDefault();
          isResizing = true;
          startX = e.clientX;
          startY = e.clientY;
          startW = input ? input.offsetWidth : 250;
          startH = input ? input.offsetHeight : 200;

          try { if (ScratchBlocks && ScratchBlocks.mainWorkspace) ScratchBlocks.mainWorkspace.allowDragging = false; } catch (e) {}
          if (parent && typeof parent.setMovable === 'function') {
            try { parent.setMovable(false); } catch (e) {}
          }

          function onMouseMove(ev) {
            if (!isResizing) return;
            try { iframe.style.pointerEvents = "none"; } catch (er) {}
            const newW = Math.max(150, startW + (ev.clientX - startX));
            const newH = Math.max(100, startH + (ev.clientY - startY));
            try {
              if (input) {
                input.style.width = `${newW}px`;
                input.style.height = `${newH}px`;
              }
              resizeHandle.style.left = `${newW - 20}px`;
              resizeHandle.style.top = `${newH - 40}px`;
              if (inputObject && inputObject.setAttribute) {
                inputObject.setAttribute("width", newW);
                inputObject.setAttribute("height", newH);
              }
              if (field.size_) {
                field.size_.width = newW;
                field.size_.height = newH - 10;
              }
              if (srcBlock && typeof srcBlock.render === 'function') srcBlock.render();
            } catch (er) {}
          }

          function onMouseUp() {
            isResizing = false;
            try { if (ScratchBlocks && ScratchBlocks.mainWorkspace) ScratchBlocks.mainWorkspace.allowDragging = true; } catch (er) {}
            if (parent && typeof parent.setMovable === 'function') {
              try { parent.setMovable(true); } catch (er) {}
            }
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            setTimeout(() => setEditorActive(false), 0);
          }

          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        });

        // monkey patch parent's svgGroup_.setAttribute to toggle pointer-events during block drag
        try {
          if (parent && parent.svgGroup_ && typeof parent.svgGroup_.setAttribute === 'function') {
            const ogSetAtt = parent.svgGroup_.setAttribute;
            parent.svgGroup_.setAttribute = (...args) => {
              try {
                if (args[0] === "class") {
                  const classStr = typeof args[1] === 'string' ? args[1] : '';
                  const draggingNow = classStr.includes("blocklyDragging");
                  const parentIsNowFlyout = !!(parent && parent.isInFlyout);
                  if (parentIsNowFlyout || draggingNow) {
                    try { iframe.style.pointerEvents = "none"; } catch (e) {}
                    try { resizeHandle.style.pointerEvents = "none"; } catch (e) {}
                    try { if (ScratchBlocks && ScratchBlocks.mainWorkspace) ScratchBlocks.mainWorkspace.allowDragging = true; } catch (e) {}
                  } else {
                    // do nothing — allow hover/pointer handlers to enable editor when appropriate
                  }
                }
              } catch (e) {}
              return ogSetAtt.call(parent.svgGroup_, ...args);
            };
          }
        } catch (e) {}
      },
      () => { /* no-create cleanup */ },
      () => { /* no-remove cleanup */ }
    );
  }

  if (isScratchBlocksReady) initBlockTools();

  // clear handlers on workspace update so stale IDs don't hang around and re-init when scratchblocks loads
  if (vm && vm.runtime && typeof vm.runtime.on === "function") {
    vm.runtime.on("workspaceUpdate", () => {
      codeEditorHandlers.clear();
      isScratchBlocksReady = typeof ScratchBlocks === "object";
      if (isScratchBlocksReady) {
        try { initBlockTools(); } catch (e) {}
      }
    });
  }

  // -------------------------
  // JSObject wrapper (custom type)
  // -------------------------
  class JSObject {
    // id used by serializer registration
    customId = "jsObject";

    constructor(value) {
      // store actual JS value (could be primitive, object, function, class instance...)
      this.value = value;
    }

    // Provide a toJSON so JSON.stringify(JSObjectInstance) won't blow up on BigInt/cycles.
    // Also: return native primitives (number/boolean/string/null) directly so runtime sees them.
    toJSON() {
      try {
        const v = this.value;
        const t = typeof v;
        // primitives -> return directly (numbers & booleans as native types)
        if (v === null) return null;
        if (t === 'number' || t === 'boolean' || t === 'string') return v;
        if (t === 'undefined') return undefined;
        if (t === 'bigint') {
          const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
          const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
          if (v >= minSafe && v <= maxSafe) return Number(v);
          return v.toString();
        }
        // Functions -> return their source string (can't serialize functions)
        if (t === 'function') return v.toString();
        // Objects/arrays -> use safeSerialize then parse back to structured object if possible
        try {
          const s = safeSerialize(v);
          try {
            if (DEBUG) console.dir(s);
            return JSON.parse(s);
          } catch (_) {
            // if parsing fails, return the safe string so stringify won't throw
            return s;
          }
        } catch (e) {
          return String(v);
        }
      } catch (e) {
        return String(this.value);
      }
    }

    // string shown in reporter bubble / lists
    toString() {
      try {
        const v = this.value;
        if (v === null) return "null";
        if (v === undefined) return "undefined";
        const t = typeof v;
        if (t === "function") {
          // show function signature
          return v.name ? `[Function ${v.name}]` : "[Function]";
        }
        if (t === "object") {
          // try JSON quickly (safeSerialize to handle BigInt/circular), fallback to constructor name
          try {
            if (DEBUG) console.dir({ safe: safeSerialize(v) });
            // show concise label rather than giant JSON
            if (Array.isArray(v)) return `[Array(${v.length})]`;
            if (v && v.constructor && v.constructor.name) return `[${v.constructor.name}]`;
            return "[Object]";
          } catch (e) {
            return v && v.constructor && v.constructor.name
            ? `[object ${v.constructor.name}]`
            : "[object]";
          }
        }
        // primitives: strings should appear as plain text, numbers/booleans as their textual form
        if (t === 'string') return v;
        return String(v); // number/boolean/bigint fallback (bigint will show as e.g. "123n")
      } catch (e) {
        return "[unprintable]";
      }
    }

    toReporterContent() {
      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.margin = '0';
      pre.style.fontFamily = 'monospace';
      pre.textContent = this.toString();
      return pre;
    }

    toMonitorContent() {
      return this.toReporterContent();
    }

    toListItem() {
      return this.toReporterContent();
    }

    toListEditor() {
      return this.toString();
    }

    fromListEditor(edit) {
      // attempt to parse JSON or treat as string
      try {
        this.value = JSON.parse(edit);
      } catch {
        this.value = edit;
      }
      return this;
    }

    // helper: convert incoming thing into a JSObject wrapper (preserving if already wrapped)
    static toType(x) {
      // Already wrapper
      if (x instanceof JSObject) return x;

      // If x is VM-provided "custom" type from other extensions (they may already be wrapper objects),
      // detect by customId property and just wrap the object.
      if (x && typeof x === "object" && x.customId && typeof x.customId === "string") {
        // try to use the serializer to rehydrate if available
        try {
          if (vm && vm.runtime && vm.runtime.serializers && vm.runtime.serializers[x.customId]) {
            // if x is already deserialized object, leave as-is by wrapping
            return new JSObject(x);
          }
        } catch (_) {}
        return new JSObject(x);
      }

      // Plain objects, functions, primitives -> wrap directly
      return new JSObject(x);
    }

    // convert for serializing nested values (used by serializer)
    static prepareForSerialize(v) {
      // If value is a custom-type (has customId), use its serializer if available
      if (v && typeof v === 'object' && v.customId && vm && vm.runtime && vm.runtime.serializers && vm.runtime.serializers[v.customId]) {
        try {
          return {
            _nestedCustom: true,
            typeId: v.customId,
            data: vm.runtime.serializers[v.customId].serialize(v)
          };
        } catch (e) { /* fallthrough */ }
      }

      // Functions: store source (best-effort)
      if (typeof v === 'function') {
        return { _functionSource: v.toString() };
      }

      // Try JSON (use safeSerialize to handle BigInt/circular)
      try {
        const json = safeSerialize(v);
        return { _json: json };
      } catch (e) {
        // fallback to toString
        return { _string: String(v) };
      }
    }

    // reconstruct inner value from serialized form
    static reconstructFromSerialize(obj) {
      try {
        if (obj && typeof obj === 'object') {
          if (obj._nestedCustom && obj.typeId && vm.runtime.serializers[obj.typeId]) {
            return vm.runtime.serializers[obj.typeId].deserialize(obj.data);
          }
          if (obj._functionSource && typeof obj._functionSource === 'string') {
            // Carefully re-create function via eval - closures won't be preserved.
            try {
              // wrap in parentheses to support function declarations and arrow funcs
              const fn = eval('(' + obj._functionSource + ')');
              return fn;
            } catch (e) {
              try {
                // sometimes function source is "function name() { ... }" - eval directly
                return eval(obj._functionSource);
              } catch (ee) {
                return obj._functionSource; // fallback string
              }
            }
          }
          if (obj._json) {
            try {
              return JSON.parse(obj._json);
            } catch (e) {
              // If JSON.parse fails (shouldn't for safeSerialize output), fallback to the raw string
              return obj._json;
            }
          }
          if (obj._string) {
            return obj._string;
          }
        }
      } catch (e) {}
      return null;
    }
  }

  // descriptor for Scratch runtime to know we have a custom type
  const JSObjectDescriptor = {
    Type: JSObject,
    Block: {
      blockType: Scratch.BlockType.REPORTER,
      blockShape: Scratch.BlockShape.BUMPED,
      forceOutputType: "JSObject",
      disableMonitor: true
    },
    Argument: {
      shape: Scratch.BlockShape.BUMPED,
      exemptFromNormalization: true,
      check: ["JSObject"]
    }
  };

  // -------------------------
  // Extension Implementation
  // -------------------------
  class JSOOPExtension {
    constructor() {
      // register compiled blocks metadata (helps the runtime)
      if (vm && vm.runtime && typeof vm.runtime.registerCompiledExtensionBlocks === 'function') {
        vm.runtime.registerCompiledExtensionBlocks('jsoop', this.getInfo());
      }

      // register serializer so variables storing JSObject survive save/load
      if (vm && vm.runtime && typeof vm.runtime.registerSerializer === 'function') {
        vm.runtime.registerSerializer(
          "jsObject",
          (v) => {
            // serialize wrapper value
            if (v instanceof JSObject) {
              try {
                const inner = v.value;
                // nested custom types are serialized via runtime.serializers
                return { wrapped: JSObject.prepareForSerialize(inner) };
              } catch (e) {
                return { wrapped: { _string: String(v.value) } };
              }
            }
            return null;
          },
          (data) => {
            // data is { wrapped: ... }
            try {
              if (!data || typeof data !== 'object') return null;
              const reconstructed = JSObject.reconstructFromSerialize(data.wrapped);
              return new JSObject(reconstructed);
            } catch (_) {
              return null;
            }
          }
        );
      }
    }

    getInfo() {
      return {
        id: 'jsoop',
        name: 'JS OOP Bridge',
        color1: '#6b8cff',
        color2: '#4968d9',
        color3: '#334fb7',
        blocks: [
          // evaluate arbitrary JS and return its value wrapped as JSObject
          {
            opcode: 'evalJS',
            blockType: Scratch.BlockType.REPORTER,
            text: 'eval JS [CODE]',
            arguments: {
              CODE: {
                type: Scratch.ArgumentType.CUSTOM,
                id: "jsoop-codeEditor",
                // default identical to what you used earlier
                defaultValue: 'return {name: "Alice"}',
                exemptFromNormalization: true
              }
            },
            ...JSObjectDescriptor.Block
          },

          // run code without returning (command)
          {
            opcode: 'runJS',
            blockType: Scratch.BlockType.COMMAND,
            text: 'run JS [CODE]',
            arguments: {
              CODE: {
                type: Scratch.ArgumentType.CUSTOM,
                id: "jsoop-codeEditor",
                defaultValue: 'console.log("hi")',
                exemptFromNormalization: true
              }
            }
          },

          // construct new instance: new [CONSTRUCTOR] with args [ARGS]
          {
            opcode: 'new',
            blockType: Scratch.BlockType.REPORTER,
            text: 'new [CONSTRUCTOR] with args [ARGS]',
            arguments: {
              CONSTRUCTOR: JSObjectDescriptor.Argument,
              ARGS: {
                ...jwArray.Argument,
                defaultValue: new jwArray.Type([])
              }
            },
            ...JSObjectDescriptor.Block
          },

          // call a method with args (args is jwArray)
          {
            opcode: 'callMethod',
            blockType: Scratch.BlockType.REPORTER,
            text: 'call method [METHOD] on [INSTANCE] with args [ARGS]',
            arguments: {
              METHOD: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'toString',
                exemptFromNormalization: true
              },
              INSTANCE: JSObjectDescriptor.Argument,
              ARGS: {
                ...jwArray.Argument,
                defaultValue: new jwArray.Type([])
              }
            },
            // returns JSObject (wrapped)
            ...JSObjectDescriptor.Block
          },

          // await call method (reporter) - waits if result is a Promise/thenable
          {
            opcode: 'awaitCallMethod',
            blockType: Scratch.BlockType.REPORTER,
            text: 'await call method [METHOD] on [INSTANCE] with args [ARGS]',
            arguments: {
              METHOD: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'then',
                exemptFromNormalization: true
              },
              INSTANCE: JSObjectDescriptor.Argument,
              ARGS: {
                ...jwArray.Argument,
                defaultValue: new jwArray.Type([])
              }
            },
            ...JSObjectDescriptor.Block
          },

          // run method without returning
          {
            opcode: 'runMethod',
            blockType: Scratch.BlockType.COMMAND,
            text: 'run method [METHOD] on [INSTANCE] with args [ARGS]',
            arguments: {
              METHOD: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'setName',
                exemptFromNormalization: true
              },
              INSTANCE: JSObjectDescriptor.Argument,
              ARGS: {
                ...jwArray.Argument,
                defaultValue: new jwArray.Type([])
              }
            }
          },

          // get property
          {
            opcode: 'getProp',
            blockType: Scratch.BlockType.REPORTER,
            text: 'get property [PROP] of [INSTANCE]',
            arguments: {
              PROP: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'name',
                exemptFromNormalization: true
              },
              INSTANCE: JSObjectDescriptor.Argument
            }
          },

          // set property with string/number
          {
            opcode: 'setPropString',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set property [PROP] of [INSTANCE] to string [VALUE]',
            arguments: {
              PROP: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'name',
                exemptFromNormalization: true
              },
              INSTANCE: JSObjectDescriptor.Argument,
              VALUE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'Bob'
              }
            }
          },

          // set property with JSObject
          {
            opcode: 'setPropJSObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set property [PROP] of [INSTANCE] to JSObject [VALUE]',
            arguments: {
              PROP: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'data',
                exemptFromNormalization: true
              },
              INSTANCE: JSObjectDescriptor.Argument,
              VALUE: JSObjectDescriptor.Argument
            }
          },

          // set property with jwArray
          {
            opcode: 'setPropJwArray',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set property [PROP] of [INSTANCE] to jwArray [VALUE]',
            arguments: {
              PROP: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'items',
                exemptFromNormalization: true
              },
              INSTANCE: JSObjectDescriptor.Argument,
              VALUE: {
                ...jwArray.Argument,
                defaultValue: new jwArray.Type([])
              }
            }
          },

          // set property with dogeiscutObject
          {
            opcode: 'setPropDogeiscutObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set property [PROP] of [INSTANCE] to dogeiscutObject [VALUE]',
            arguments: {
              PROP: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'config',
                exemptFromNormalization: true
              },
              INSTANCE: JSObjectDescriptor.Argument,
              VALUE: vm.dogeiscutObject ? {
                ...vm.dogeiscutObject.Argument,
                defaultValue: new vm.dogeiscutObject.Type({})
              } : {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '{}'
              }
            }
          },

          // stringify any value (if JSObject, stringify inner)
          {
            opcode: 'stringify',
            blockType: Scratch.BlockType.REPORTER,
            text: 'JSON stringify [VALUE]',
            arguments: {
              VALUE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: '{"a":1}',
                exemptFromNormalization: true
              }
            }
          },

          // helper: return type name of instance (for debugging)
          {
            opcode: 'typeName',
            blockType: Scratch.BlockType.REPORTER,
            text: 'type name of [INSTANCE]',
            arguments: {
              INSTANCE: JSObjectDescriptor.Argument
            }
          },

          // ===== SEPARATOR =====
          {
            opcode: 'separator1',
            blockType: Scratch.BlockType.LABEL,
            text: 'Common JavaScript Constants'
          },

          // ===== CONSTANT REPORTERS =====
          {
            opcode: 'constantMath',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Math',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantNull',
            blockType: Scratch.BlockType.REPORTER,
            text: 'null',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantUndefined',
            blockType: Scratch.BlockType.REPORTER,
            text: 'undefined',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantObject',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Object',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantArray',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Array',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantString',
            blockType: Scratch.BlockType.REPORTER,
            text: 'String',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantNumber',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Number',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantBoolean',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Boolean',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantFunction',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Function',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantAsyncFunction',
            blockType: Scratch.BlockType.REPORTER,
            text: 'AsyncFunction',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantDate',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Date',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantRegExp',
            blockType: Scratch.BlockType.REPORTER,
            text: 'RegExp',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantJSON',
            blockType: Scratch.BlockType.REPORTER,
            text: 'JSON',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantPromise',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Promise',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantError',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Error',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantMap',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Map',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantSet',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Set',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantWeakMap',
            blockType: Scratch.BlockType.REPORTER,
            text: 'WeakMap',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantWeakSet',
            blockType: Scratch.BlockType.REPORTER,
            text: 'WeakSet',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantSymbol',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Symbol',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantProxy',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Proxy',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantReflect',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Reflect',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantIntl',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Intl',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantConsole',
            blockType: Scratch.BlockType.REPORTER,
            text: 'console',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantGlobalThis',
            blockType: Scratch.BlockType.REPORTER,
            text: 'globalThis',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantInfinity',
            blockType: Scratch.BlockType.REPORTER,
            text: 'Infinity',
            ...JSObjectDescriptor.Block
          },
          {
            opcode: 'constantNaN',
            blockType: Scratch.BlockType.REPORTER,
            text: 'NaN',
            ...JSObjectDescriptor.Block
          },
        ]
      };
    }

    // helper funcs
    toggleSandbox() {
      if (this.isEditorUnsandboxed) {
        this.isEditorUnsandboxed = false;
        this.runtime.extensionManager.refreshBlocks("jsoop");
      } else {
        this.runtime.vm.securityManager.canUnsandbox("JavaScript").then((isAllowed) => {
          if (!isAllowed) return;
          this.isEditorUnsandboxed = true;
          this.runtime.extensionManager.refreshBlocks("jsoop");
        });
      }
    }

    packagerInfo() {
      alert([
        "You can run code Unsandboxed in the Project Packager but toggling:",
        "'Player Options > Remove sandbox on the JavaScript Ext.'",
        "On!"
      ].join("\n"));
    }

    parseArguments(argJSON) {
      try {
        if (argJSON && argJSON.constructor?.name === "Object") return argJSON;
        else {
          // this is a PM custom return api value
          argJSON = argJSON.toString();
          if (typeof argJSON === "object" && !Array.isArray(argJSON)) return argJSON;
          else return JSON.parse(argJSON);
        }
      } catch(err) {
        console.warn(`Failed to parse Javascript Data JSON: ${err}`);
        return {};
      }
    }

    isLegalFuncName(name) {
      try {
        new Function(`function ${name}(){}`);
        return true;
      } catch {
        return false;
      }
    }

    async runCode(code, binds) {
      let binders = "";

      /* inject global functions */
      if (this.globalFuncs && this.globalFuncs.size > 0) {
        const funcs = this.globalFuncs.entries().toArray();
        for (const [name, funcData] of funcs) {
          if (funcData.isBlockCode) {
            binders += `const ${name} = async function(...args) {\n`;
            if (funcData.id) {
              binders += `return new Promise((resolve) => {\n`;
              binders += `const target = vm.runtime.getTargetById("${funcData.origin}");\n`;
              binders += `const thread = vm.runtime._pushThread("${funcData.id}", target);\n`;
              binders += `const threadID = thread.getId();\n`;
              binders += `thread.jsExtData = [...args];\n`;

              /* listener for thread returns */
              binders += `const endHandler = (t) => {\n`;
              binders += `if (t.getId() === thread.getId()) {\n`;
              binders += `vm.runtime.removeListener("THREAD_FINISHED", endHandler);\n`;
              binders += `resolve(t.justReported);\n`;
              binders += "}\n";
              binders += "};\n";
              binders += `vm.runtime.on("THREAD_FINISHED", endHandler);\n`;
              binders += "});\n";
            }
            binders += "}\n";
          } else {
            binders += `const ${name} = ${funcData.code}\n`;
          }
        }
      }

      /* inject arguments */
      if (binds !== undefined) {
        for (let [name, value] of Object.entries(binds)) {
          // normalize values
          switch (typeof value) {
            case "string":
              value = `"${value}"`;
              break;
            case "object":
              value = JSON.stringify(value);
              break;
            default: break;
          }
          binders += `const ${name} = ${value};\n`;
        }
      }

      /* 'extensionRuntimeOptions.javascriptUnsandboxed' is used for packager */
      if (this.isEditorUnsandboxed || this.runtime.extensionRuntimeOptions && this.runtime.extensionRuntimeOptions.javascriptUnsandboxed === true) {
        let result;
        try {
          // eslint-disable-next-line no-eval
          result = await runCode(binders + code);
        } catch (err) {
          throw err;
        }
        return result;
      }
      // we are sandboxed
      const codeRunner = `Object.getPrototypeOf(async function() {}).constructor(\`${(binders + code).replaceAll("`", "\\`")}\`)()`;
      return new Promise((resolve) => {
        SandboxRunner.execute(codeRunner).then(result => {
          // result is { value: any, success: boolean }
          // in PM, we always ignore errors
          return resolve(result.value);
        });
      });
    }

    // block funcs
    codeInput(args) {
      return args.CODE;
    }

    async jsCommand(args) {
      await this.runCode(Cast.toString(args.CODE));
    }
    async jsCommandBinded(args) {
      await this.runCode(
        Cast.toString(args.CODE),
        this.parseArguments(args.ARGS)
      );
    }

    async jsReporter(args) {
      return await this.runCode(Cast.toString(args.CODE));
    }
    async jsReporterBinded(args) {
      return await this.runCode(
        Cast.toString(args.CODE),
        this.parseArguments(args.ARGS)
      );
    }

    async jsBoolean(args) {
      const possiblePromise = await this.runCode(Cast.toString(args.CODE));
      /* force output a boolean */
      if (possiblePromise && typeof possiblePromise.then === "function") {
        return (async () => {
          const value = await possiblePromise;
          return Cast.toBoolean(value);
        })();
      }
      return Cast.toBoolean(possiblePromise);
    }
    async jsBooleanBinded(args) {
      const possiblePromise = await this.runCode(
        Cast.toString(args.CODE),
        this.parseArguments(args.ARGS)
      );
      /* force output a boolean */
      if (possiblePromise && typeof possiblePromise.then === "function") {
        return (async () => {
          const value = await possiblePromise;
          return Cast.toBoolean(value);
        })();
      }
      return Cast.toBoolean(possiblePromise);
    }

    defineGlobalFunc(args) {
      const funcName = Cast.toString(args.NAME);
      if (this.isLegalFuncName(funcName)) {
        const funcRegex = /^function\s*\([^)]*\)\s*\{[\s\S]*\}$/;
        const lambRegex = /^\([^)]*\)\s*=>\s*(\{[\s\S]*\}|[^{}][^\n]*)$/;
        const code = Cast.toString(args.CODE).trim();
        if (funcRegex.test(code) || lambRegex.test(code)) this.globalFuncs.set(funcName, { code, isBlockCode: false });
        else throw new Error("Global Code must be 'function' or 'lambda'!");
      } else {
        throw new Error("Illegal Function Name!");
      }
    }

    defineScratchCode(args, util) {
      const funcName = Cast.toString(args.NAME);
      if (this.isLegalFuncName(funcName)) {
        const branch = util.thread.blockContainer.getBranch(util.thread.peekStack(), 1);
        this.globalFuncs.set(funcName, { id: branch, origin: util.target.id, isBlockCode: true });
      } else {
        throw new Error("Illegal Function Name!");
      }
    }

    argumentReport(_, util) {
      return util.thread.jsExtData ? JSON.stringify(util.thread.jsExtData) : "[]";
    }

    deleteGlobalFunc(args) {
      this.globalFuncs.delete(Cast.toString(args.NAME));
    }

    returnData(args, util) {
      util.thread.justReported = args.DATA;
      // Delay the Deletion of this Thread
      if (util.stackTimerNeedsInit()) {
        util.startStackTimer(0);
        this.runtime.requestRedraw();
        util.yield();
      } else if (!util.stackTimerFinished()) util.yield();
      util.thread.stopThisScript();
    }
  }

  // register the extension
  Scratch.extensions.register(new JSOOPExtension());
})(Scratch);
