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

  // Check if ScratchBlocks is available
  const isScratchBlocksReady = typeof ScratchBlocks === "object";
  const codeEditorHandlers = new Map();
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

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

  // Initialize code editor if ScratchBlocks is available
  function initBlockTools() {
    if (!isScratchBlocksReady) return;

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
        const input = inputObject.firstChild;
        const srcBlock = field.sourceBlock_;
        const parent = srcBlock.parentBlock_;
        const dragCheck = parent.isInFlyout || srcBlock.svgGroup_.classList.contains("blocklyDragging") ? "none" : "all";

        inputObject.setAttribute("pointer-events", "none");
        input.style.height = "210px";
        const iframe = document.createElement("iframe");
        iframe.setAttribute("style", `pointer-events: ${dragCheck}; background: #272822; border-radius: 10px; border: none; ${isSafari ? "" : "width: 100%;"} height: calc(100% - 20px);`);
        iframe.setAttribute("sandbox", "allow-scripts");

        const html = `
<!DOCTYPE html>
<html><head>
  <style>html, body, #editor {background: #272822; margin: 0; padding: 0; height: 100%; width: 100%;}</style>
</head>
<body>
  <div id="editor"></div>
  <script src="https://cdn.jsdelivr.net/npm/ace-builds@1.32.3/src-min-noconflict/ace.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/ace-builds@1.32.3/src-min-noconflict/mode-javascript.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/ace-builds@1.32.3/src-min-noconflict/theme-monokai.js"></script>
  <script>
    window.addEventListener("message", function(e) {
      const editor = ace.edit("editor");
      editor.setOptions({
        fontSize: "15px", showPrintMargin: false,
        highlightActiveLine: true, useWorker: false
      });

      editor.session.setMode("ace/mode/javascript");
      editor.setTheme("ace/theme/monokai");
      editor.setValue(e.data.value);
      editor.session.on("change", () => parent.postMessage({
        type: "code-change", id: "${srcBlock.id}", value: editor.getValue()
      }, "*"));
    }, { once: true });
  </script>
</body>
</html>`;
        iframe.src = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        input.replaceChild(iframe, input.firstChild);
        iframe.onload = () => {
          let value = field.getValue();
          if (value === "needsInit") {
            const outerType = srcBlock.parentBlock_.type;
            if (outerType.endsWith("evalJSEditor")) value = 'return {name: "Alice"}';
            else if (outerType.endsWith("runJSEditor")) value = 'console.log("hi")';
            field.setValue(value);
          }

          iframe.contentWindow.postMessage({ value }, "*");
        };

        // listen for code updates
        codeEditorHandlers.set(srcBlock.id, (value) => field.setValue(value));

        const resizeHandle = document.createElement("div");
        resizeHandle.setAttribute("style", `pointer-events: ${dragCheck}; position: absolute; right: 5px; bottom: 15px; width: 12px; height: 12px; background: #ffffff40; cursor: se-resize; border-radius: 0px 0 50px 0;`);
        input.appendChild(resizeHandle);

        let isResizing = false;
        let startX, startY, startW, startH;
        resizeHandle.addEventListener("mousedown", (e) => {
          if (parent.isInFlyout) return;
          e.preventDefault();
          isResizing = true;
          startX = e.clientX;
          startY = e.clientY;
          startW = input.offsetWidth;
          startH = input.offsetHeight;
          ScratchBlocks.mainWorkspace.allowDragging = false;
          parent.setMovable(false);

          function onMouseMove(ev) {
            if (!isResizing) return;
            iframe.style.pointerEvents = "none";
            const newW = Math.max(150, startW + (ev.clientX - startX));
            const newH = Math.max(100, startH + (ev.clientY - startY));
            input.style.width = `${newW}px`;
            input.style.height = `${newH}px`;
            resizeHandle.style.left = `${newW - 20}px`;
            resizeHandle.style.top = `${newH - 40}px`;
            inputObject.setAttribute("width", newW);
            inputObject.setAttribute("height", newH);
            field.size_.width = newW;
            field.size_.height = newH - 10;
            if (srcBlock?.render) srcBlock.render();
          }

          function onMouseUp() {
            isResizing = false;
            ScratchBlocks.mainWorkspace.allowDragging = true;
            parent.setMovable(true);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
          }

          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        });

        // monkey patch this function since MutationObservers will lag
        // this patch allows dragging blocks to not act weird with mouse touching
        const ogSetAtt = parent.svgGroup_.setAttribute;
        parent.svgGroup_.setAttribute = (...args) => {
          if (args[0] === "class") {
            if (parent.isInFlyout || args[1].includes("blocklyDragging")) {
              iframe.style.pointerEvents = "none";
              resizeHandle.style.pointerEvents = "none";
            } else {
              iframe.style.pointerEvents = "all";
              resizeHandle.style.pointerEvents = "all";
            }
          }
          ogSetAtt.call(parent.svgGroup_, ...args);
        }
      },
      () => { /* no work needs to be done here */ },
      () => { /* no work needs to be done here */ }
    );
  }

  // Initialize block tools if ScratchBlocks is ready
  if (isScratchBlocksReady) initBlockTools();

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

      // Listen for workspace updates to clear code editor handlers
      if (vm && vm.runtime) {
        vm.runtime.on('workspaceUpdate', () => {
          codeEditorHandlers.clear();
          if (!isScratchBlocksReady && typeof ScratchBlocks === "object") {
            initBlockTools();
          }
        });
      }
    }

    getInfo() {
      const useCodeEditor = isScratchBlocksReady && !isSafari;

      return {
        id: 'jsoop',
        name: 'JS OOP Bridge',
        color1: '#6b8cff',
        color2: '#4968d9',
        color3: '#334fb7',
        blocks: [
          // Code input block (hidden, used by fill-in)
          {
            opcode: 'codeInput',
            blockType: Scratch.BlockType.REPORTER,
            text: '[CODE]',
            hideFromPalette: true,
            arguments: {
              CODE: {
                type: Scratch.ArgumentType.CUSTOM,
                customId: "jsoop-codeEditor",
                defaultValue: "needsInit"
              }
            }
          },

          // evaluate arbitrary JS with code editor
          {
            opcode: 'evalJSEditor',
            blockType: Scratch.BlockType.REPORTER,
            text: 'eval JS [CODE]',
            hideFromPalette: !useCodeEditor,
            arguments: {
              CODE: {
                fillIn: 'codeInput'
              }
            },
            ...JSObjectDescriptor.Block
          },

          // run code without returning with code editor
          {
            opcode: 'runJSEditor',
            blockType: Scratch.BlockType.COMMAND,
            text: 'run JS [CODE]',
            hideFromPalette: !useCodeEditor,
            arguments: {
              CODE: {
                fillIn: 'codeInput'
              }
            }
          },

          // evaluate arbitrary JS with string input (fallback)
          {
            opcode: 'evalJS',
            blockType: Scratch.BlockType.REPORTER,
            text: 'eval JS [CODE]',
            hideFromPalette: useCodeEditor,
            arguments: {
              CODE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'return {name: "Alice"}',
                exemptFromNormalization: true
              }
            },
            ...JSObjectDescriptor.Block
          },

          // run code without returning with string input (fallback)
          {
            opcode: 'runJS',
            blockType: Scratch.BlockType.COMMAND,
            text: 'run JS [CODE]',
            hideFromPalette: useCodeEditor,
            arguments: {
              CODE: {
                type: Scratch.ArgumentType.STRING,
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

    // -------------------------
    // Helpers used by blocks
    // -------------------------
    _wrapMaybe(x) {
      // If x is already a JSObject wrapper, return it
      if (x instanceof JSObject) return x;
      // If x looks like a wrapper-like object (has customId), wrap it
      if (x && typeof x === 'object' && x.customId) return new JSObject(x);
      // Wrap whatever it is
      return new JSObject(x);
    }

    _convertJwArrayToArgs(jwArrayObj) {
      if (jwArrayObj instanceof jwArray.Type) {
        // Convert jwArray to regular array and unwrap any JSObjects
        return jwArrayObj.array.map(item => {
          if (item instanceof JSObject) {
            return item.value;
          }
          return item;
        });
      }
      return [];
    }

    _convertResultToJwArray(result) {
      // Convert Array results to jwArray for consistency
      if (Array.isArray(result) && !(result instanceof jwArray.Type)) {
        return new jwArray.Type(result);
      }
      return result;
    }

    _convertToNativeValue(value) {
      // Convert dogeiscutObject to native object
      if (value && typeof value === 'object' && value.object && value.customId === 'dogeiscutObject') {
        return value.object;
      }
      // Convert jwArray to native array
      if (value && typeof value === 'object' && value.array && value.customId === 'jwArray') {
        return value.array;
      }
      // Convert JSObject to its inner value
      if (value instanceof JSObject) {
        return value.value;
      }
      return value;
    }

    _convertToSafeString(value) {
      const nativeValue = this._convertToNativeValue(value);
      if (nativeValue instanceof JSObject) {
        return nativeValue.toString();
      }
      try {
        return String(nativeValue);
      } catch (e) {
        return '[unconvertible]';
      }
    }

    // ===== CONSTANT REPORTER IMPLEMENTATIONS =====
    constantMath() {
      return new JSObject(Math);
    }

    constantNull() {
      return new JSObject(null);
    }

    constantUndefined() {
      return new JSObject(undefined);
    }

    constantObject() {
      return new JSObject(Object);
    }

    constantArray() {
      return new JSObject(Array);
    }

    constantString() {
      return new JSObject(String);
    }

    constantNumber() {
      return new JSObject(Number);
    }

    constantBoolean() {
      return new JSObject(Boolean);
    }

    constantFunction() {
      return new JSObject(Function);
    }
    
    constantAsyncFunction() {
      return new JSObject(Object.getPrototypeOf(async function(){}).constructor);
    }

    constantDate() {
      return new JSObject(Date);
    }

    constantRegExp() {
      return new JSObject(RegExp);
    }

    constantJSON() {
      return new JSObject(JSON);
    }

    constantPromise() {
      return new JSObject(Promise);
    }

    constantError() {
      return new JSObject(Error);
    }

    constantMap() {
      return new JSObject(Map);
    }

    constantSet() {
      return new JSObject(Set);
    }

    constantWeakMap() {
      return new JSObject(WeakMap);
    }

    constantWeakSet() {
      return new JSObject(WeakSet);
    }

    constantSymbol() {
      return new JSObject(Symbol);
    }

    constantProxy() {
      return new JSObject(Proxy);
    }

    constantReflect() {
      return new JSObject(Reflect);
    }

    constantIntl() {
      return new JSObject(Intl);
    }

    constantConsole() {
      return new JSObject(console);
    }

    constantGlobalThis() {
      return new JSObject(globalThis);
    }

    constantInfinity() {
      return new JSObject(Infinity);
    }

    constantNaN() {
      return new JSObject(NaN);
    }

    // ===== EXISTING BLOCK IMPLEMENTATIONS =====
    
    // Code input handler
    codeInput(args) {
      return args.CODE;
    }

    // evaluate code and return wrapped result (with code editor)
    evalJSEditor({ CODE }) {
      return this.evalJS({ CODE });
    }

    // run code without returning (with code editor)
    runJSEditor({ CODE }) {
      return this.runJS({ CODE });
    }

    // evaluate code and return wrapped result
    evalJS({ CODE }) {
      if (DEBUG) console.dir({ action: 'evalJS(entry)', CODE });
      try {
        // Use Function to execute user code and return its result.
        // We wrap code in an IIFE so users can write statements and final value is returned.
        // Note: if CODE uses top-level return, it will error; better to wrap
        const fn = new Function('"use strict"; return (function(){ ' + CODE + ' })()');
        const result = fn();
        if (DEBUG) console.dir({ action: 'evalJS(resultRaw)', result });
        const wrapped = JSObject.toType(result);
        if (DEBUG) console.dir({ action: 'evalJS(wrapped)', wrapped });
        return wrapped;
      } catch (err) {
        if (DEBUG) console.dir({ action: 'evalJS(error)', error: err });
        // return an object that holds the error string
        return new JSObject({ error: String(err) });
      }
    }

    // run code without returning (command)
    runJS({ CODE }) {
      if (DEBUG) console.dir({ action: 'runJS(entry)', CODE });
      try {
        const fn = new Function('"use strict"; ' + CODE);
        fn();
        if (DEBUG) console.dir({ action: 'runJS(done)' });
      } catch (err) {
        if (DEBUG) console.dir({ action: 'runJS(error)', error: err });
      }
    }

    // construct new instance using constructor function/class
    new({ CONSTRUCTOR, ARGS }) {
      if (DEBUG) console.dir({ action: 'new(entry)', CONSTRUCTOR, ARGS });
      try {
        const ctorWrap = JSObject.toType(CONSTRUCTOR);
        const ctor = ctorWrap.value;
        const args = this._convertJwArrayToArgs(ARGS);
        if (typeof ctor !== 'function') {
          return new JSObject({ error: 'Constructor is not a function' });
        }
        try {
          const instance = Reflect.construct(ctor, args);
          if (DEBUG) console.dir({ action: 'new(result)', instance });
          const result = JSObject.toType(instance);
          return this._convertResultToJwArray(result);
        } catch (err) {
          if (DEBUG) console.dir({ action: 'new(error)', error: err });
          return new JSObject({ error: String(err) });
        }
      } catch (err) {
        if (DEBUG) console.dir({ action: 'new(errorOuter)', error: err });
        return new JSObject({ error: String(err) });
      }
    }

    // call method and return wrapped result
    callMethod({ METHOD, INSTANCE, ARGS }) {
      if (DEBUG) console.dir({ action: 'callMethod(entry)', METHOD, INSTANCE, ARGS });
      // convert received INSTANCE to wrapper if needed
      INSTANCE = JSObject.toType(INSTANCE);
      const target = INSTANCE.value;

      // convert jwArray args to regular array
      const args = this._convertJwArrayToArgs(ARGS);

      if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
        // for primitive targets, try to call methods only if they exist on the primitive's prototype
        const primProto = Object.getPrototypeOf(target);
        const fnPrim = primProto && primProto[METHOD];
        if (typeof fnPrim === 'function') {
          try {
            const result = fnPrim.apply(target, args);
            if (DEBUG) console.dir({ action: 'callMethod(resultPrimitive)', result });
            const wrappedResult = JSObject.toType(result);
            return this._convertResultToJwArray(wrappedResult);
          } catch (err) {
            if (DEBUG) console.dir({ action: 'callMethod(errorPrimitive)', error: err });
            return new JSObject({ error: String(err) });
          }
        }
        return new JSObject({ error: `No method ${METHOD} on target` });
      }

      // find method on object
      const fn = target[METHOD];
      if (typeof fn !== 'function') {
        // maybe the method is defined on the prototype but non-enumerable
        const proto = Object.getPrototypeOf(target);
        const fnProto = proto && proto[METHOD];
        if (typeof fnProto === 'function') {
          try {
            const result = fnProto.apply(target, args);
            if (DEBUG) console.dir({ action: 'callMethod(resultProto)', result });
            const wrappedResult = JSObject.toType(result);
            return this._convertResultToJwArray(wrappedResult);
          } catch (err) {
            if (DEBUG) console.dir({ action: 'callMethod(errorProto)', error: err });
            return new JSObject({ error: String(err) });
          }
        }

        return new JSObject({ error: `No method ${METHOD}` });
      }

      try {
        const result = fn.apply(target, args);
        if (DEBUG) console.dir({ action: 'callMethod(result)', result });
        const wrappedResult = JSObject.toType(result);
        return this._convertResultToJwArray(wrappedResult);
      } catch (err) {
        if (DEBUG) console.dir({ action: 'callMethod(error)', error: err });
        return new JSObject({ error: String(err) });
      }
    }

    // await call method (reporter) - waits if result is a Promise/thenable
    async awaitCallMethod({ METHOD, INSTANCE, ARGS }) {
      if (DEBUG) console.dir({ action: 'awaitCallMethod(entry)', METHOD, INSTANCE, ARGS });

      INSTANCE = JSObject.toType(INSTANCE);
      const target = INSTANCE.value;
      const args = this._convertJwArrayToArgs(ARGS);

      // handle primitive targets by checking their prototype
      if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
        const primProto = Object.getPrototypeOf(target);
        const fnPrim = primProto && primProto[METHOD];
        if (typeof fnPrim === 'function') {
          try {
            const res = fnPrim.apply(target, args);
            if (res && typeof res.then === 'function') {
              const awaited = await res;
              if (DEBUG) console.dir({ action: 'awaitCallMethod(resultPrimitiveAwaited)', awaited });
              const wrappedResult = JSObject.toType(awaited);
              return this._convertResultToJwArray(wrappedResult);
            }
            if (DEBUG) console.dir({ action: 'awaitCallMethod(resultPrimitive)', res });
            const wrappedResult = JSObject.toType(res);
            return this._convertResultToJwArray(wrappedResult);
          } catch (err) {
            if (DEBUG) console.dir({ action: 'awaitCallMethod(errorPrimitive)', error: err });
            return new JSObject({ error: String(err) });
          }
        }
        return new JSObject({ error: `No method ${METHOD} on target` });
      }

      // find method on object (own property first, then prototype)
      let fn = target[METHOD];
      if (typeof fn !== 'function') {
        const proto = Object.getPrototypeOf(target);
        fn = proto && proto[METHOD];
      }
      if (typeof fn !== 'function') {
        return new JSObject({ error: `No method ${METHOD}` });
      }

      try {
        const result = fn.apply(target, args);
        if (result && typeof result.then === 'function') {
          // await if it's thenable
          const awaited = await result;
          if (DEBUG) console.dir({ action: 'awaitCallMethod(awaited)', awaited });
          const wrappedResult = JSObject.toType(awaited);
          return this._convertResultToJwArray(wrappedResult);
        }
        if (DEBUG) console.dir({ action: 'awaitCallMethod(result)', result });
        const wrappedResult = JSObject.toType(result);
        return this._convertResultToJwArray(wrappedResult);
      } catch (err) {
        if (DEBUG) console.dir({ action: 'awaitCallMethod(error)', error: err });
        return new JSObject({ error: String(err) });
      }
    }

    // run method, no return
    runMethod({ METHOD, INSTANCE, ARGS }) {
      if (DEBUG) console.dir({ action: 'runMethod(entry)', METHOD, INSTANCE, ARGS });
      INSTANCE = JSObject.toType(INSTANCE);
      const target = INSTANCE.value;
      const args = this._convertJwArrayToArgs(ARGS);

      if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
        const primProto = Object.getPrototypeOf(target);
        const fnPrim = primProto && primProto[METHOD];
        if (typeof fnPrim === 'function') {
          try {
            fnPrim.apply(target, args);
            if (DEBUG) console.dir({ action: 'runMethod(donePrimitive)' });
            return;
          } catch (err) {
            if (DEBUG) console.dir({ action: 'runMethod(errorPrimitive)', error: err });
            return;
          }
        }
        if (DEBUG) console.dir({ action: 'runMethod(noMethod)' });
        return;
      }

      const fn = target[METHOD] || (Object.getPrototypeOf(target) && Object.getPrototypeOf(target)[METHOD]);
      if (typeof fn === 'function') {
        try {
          fn.apply(target, args);
          if (DEBUG) console.dir({ action: 'runMethod(done' });
        } catch (err) {
          if (DEBUG) console.dir({ action: 'runMethod(error)', error: err });
        }
      } else {
        if (DEBUG) console.dir({ action: 'runMethod(noMethod)', METHOD });
      }
    }

    // get property (returns safe string)
    getProp({ PROP, INSTANCE }) {
      if (DEBUG) console.dir({ action: 'getProp(entry)', PROP, INSTANCE });
      INSTANCE = JSObject.toType(INSTANCE);
      const target = this._convertToNativeValue(INSTANCE.value);
      
      try {
        const val = target[PROP];
        if (DEBUG) console.dir({ action: 'getProp(result)', val });
        return this._convertToSafeString(val);
      } catch (err) {
        if (DEBUG) console.dir({ action: 'getProp(error)', error: err });
        return `[Error: ${String(err)}]`;
      }
    }

    // set property with string/number
    setPropString({ PROP, INSTANCE, VALUE }) {
      if (DEBUG) console.dir({ action: 'setPropString(entry)', PROP, INSTANCE, VALUE });
      INSTANCE = JSObject.toType(INSTANCE);
      const target = this._convertToNativeValue(INSTANCE.value);

      // attempt to parse VALUE (try JSON -> number/boolean/null/array/object), fallback to raw string
      let parsed;
      try {
        parsed = JSON.parse(VALUE);
      } catch {
        // if VALUE looks like bare number/true/false, try simple coercion
        const t = VALUE && VALUE.trim();
        if (/^-?\d+(\.\d+)?$/.test(t)) parsed = Number(t);
        else if (t === 'true') parsed = true;
        else if (t === 'false') parsed = false;
        else parsed = VALUE;
      }

      try {
        if (target && (typeof target === 'object' || typeof target === 'function')) {
          target[PROP] = parsed;
        } else {
          // primitives: can't set property persistently — wrap to object and set
          const newObj = Object(target);
          newObj[PROP] = parsed;
          INSTANCE.value = newObj;
        }
        if (DEBUG) console.dir({ action: 'setPropString(done)', target: INSTANCE.value });
      } catch (err) {
        if (DEBUG) console.dir({ action: 'setPropString(error)', error: err });
      }
    }

    // set property with JSObject
    setPropJSObject({ PROP, INSTANCE, VALUE }) {
      if (DEBUG) console.dir({ action: 'setPropJSObject(entry)', PROP, INSTANCE, VALUE });
      INSTANCE = JSObject.toType(INSTANCE);
      const target = this._convertToNativeValue(INSTANCE.value);
      const value = this._convertToNativeValue(VALUE);

      try {
        if (target && (typeof target === 'object' || typeof target === 'function')) {
          target[PROP] = value;
        } else {
          // primitives: can't set property persistently — wrap to object and set
          const newObj = Object(target);
          newObj[PROP] = value;
          INSTANCE.value = newObj;
        }
        if (DEBUG) console.dir({ action: 'setPropJSObject(done)', target: INSTANCE.value });
      } catch (err) {
        if (DEBUG) console.dir({ action: 'setPropJSObject(error)', error: err });
      }
    }

    // set property with jwArray
    setPropJwArray({ PROP, INSTANCE, VALUE }) {
      if (DEBUG) console.dir({ action: 'setPropJwArray(entry)', PROP, INSTANCE, VALUE });
      INSTANCE = JSObject.toType(INSTANCE);
      const target = this._convertToNativeValue(INSTANCE.value);
      const value = this._convertToNativeValue(VALUE);

      try {
        if (target && (typeof target === 'object' || typeof target === 'function')) {
          target[PROP] = value;
        } else {
          // primitives: can't set property persistently — wrap to object and set
          const newObj = Object(target);
          newObj[PROP] = value;
          INSTANCE.value = newObj;
        }
        if (DEBUG) console.dir({ action: 'setPropJwArray(done)', target: INSTANCE.value });
      } catch (err) {
        if (DEBUG) console.dir({ action: 'setPropJwArray(error)', error: err });
      }
    }

    // set property with dogeiscutObject
    setPropDogeiscutObject({ PROP, INSTANCE, VALUE }) {
      if (DEBUG) console.dir({ action: 'setPropDogeiscutObject(entry)', PROP, INSTANCE, VALUE });
      INSTANCE = JSObject.toType(INSTANCE);
      const target = this._convertToNativeValue(INSTANCE.value);
      const value = this._convertToNativeValue(VALUE);

      try {
        if (target && (typeof target === 'object' || typeof target === 'function')) {
          target[PROP] = value;
        } else {
          // primitives: can't set property persistently — wrap to object and set
          const newObj = Object(target);
          newObj[PROP] = value;
          INSTANCE.value = newObj;
        }
        if (DEBUG) console.dir({ action: 'setPropDogeiscutObject(done)', target: INSTANCE.value });
      } catch (err) {
        if (DEBUG) console.dir({ action: 'setPropDogeiscutObject(error)', error: err });
      }
    }

    // JSON stringify any value (if JSObject, stringify inner)
    stringify({ VALUE }) {
      // VALUE may be a JSObject wrapper or some other raw. If it's a string in the Scratch sense it may be supplied as string.
      try {
        let inner = VALUE;
        // if it's a wrapper-like, unwrap
        if (VALUE && typeof VALUE === 'object' && VALUE.customId === 'jsObject') {
          inner = VALUE.value;
        } else if (VALUE instanceof JSObject) {
          inner = VALUE.value;
        } else {
          // attempt to parse as JSON; often user will pass JSON string or primitive string
          try {
            inner = JSON.parse(VALUE);
          } catch { /* leave as-is */ }
        }
        try {
          return safeSerialize(inner);
        } catch (e) {
          // functions -> toString
          if (typeof inner === 'function') return inner.toString();
          // fallback
          return String(inner);
        }
      } catch (err) {
        if (DEBUG) console.dir({ action: 'stringify(error)', error: err });
        return String(VALUE);
      }
    }

    // helper to get the type name (constructor name / primitive)
    typeName({ INSTANCE }) {
      INSTANCE = JSObject.toType(INSTANCE);
      const v = this._convertToNativeValue(INSTANCE.value);
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      if (typeof v === 'function') return `function ${v.name || '(anonymous)'}`;
      if (typeof v === 'object') return v.constructor && v.constructor.name ? v.constructor.name : 'Object';
      return typeof v;
    }
  }

  // register the extension
  Scratch.extensions.register(new JSOOPExtension());
})(Scratch);
