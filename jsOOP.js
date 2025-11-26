/* jshint esversion:11 */

(function (Scratch) {
    'use strict';

    if (!Scratch.extensions || !Scratch.extensions.unsandboxed) {
        throw new Error("'JS OOP' extension must run unsandboxed!");
    }

    const vm = Scratch.vm;
    const DEBUG = false;

    if (!vm.jwArray) vm.extensionManager.loadExtensionIdSync('jwArray');
    const jwArray = vm.jwArray;

    // Wait a few seconds before trying to load dogeiscutObject to give the project a chance to load it first
    let dogeiscutObjectLoaded = !!vm.dogeiscutObject;
    if (!vm.dogeiscutObject) {
        setTimeout(() => {
            if (!vm.dogeiscutObject) {
                vm.extensionManager.loadExtensionURL("https://extensions.penguinmod.com/extensions/DogeisCut/dogeiscutObject.js")
                    .then(() => {
                        dogeiscutObjectLoaded = true;
                        if (DEBUG) console.log('dogeiscutObject loaded successfully');
                    })
                    .catch((error) => {
                        console.error('Failed to load dogeiscutObject:', error);
                        // Continue even if loading fails
                        dogeiscutObjectLoaded = false;
                    });
            } else {
                dogeiscutObjectLoaded = true;
            }
        }, 3000); // Wait 3 seconds
    }

    let isScratchBlocksReady = typeof ScratchBlocks === "object";
    const codeEditorHandlers = new Map();
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // Store for function hat blocks
    const functionHats = new Map();

    function initBlockTools() {
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
                iframe.src = URL.createObjectURL(new Blob([html], {
                    type: "text/html"
                }));
                input.replaceChild(iframe, input.firstChild);
                iframe.onload = () => {
                    let value = field.getValue();
                    if (value === "jsoop-init-xyz789@!") {
                        const outerType = srcBlock.parentBlock_.type;
                        if (outerType.endsWith("evalJS")) value = `return {name: "Alice"}`;
                        else if (outerType.endsWith("runJS")) value = `console.log("Hello!")`;
                        field.setValue(value);
                    }

                    iframe.contentWindow.postMessage({
                        value
                    }, "*");
                };

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
            () => {},
            () => {}
        );
    }
    if (isScratchBlocksReady) initBlockTools();

    function safeSerialize(obj) {
        const seen = new WeakSet();
        return JSON.stringify(obj, function (key, value) {

            if (typeof value === 'bigint') {
                const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
                const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
                if (value >= minSafe && value <= maxSafe) {
                    return Number(value);
                } else {
                    return value.toString();
                }
            }

            if (value && typeof value === 'object') {
                if (seen.has(value)) return '[Circular]';
                seen.add(value);
            }
            return value;
        }, 2);
    }

    class JSObject {

        get customId() {
            return "jsObject";
        }

        constructor(value) {
            this.value = value;
        }

        toJSON() {
            try {
                const v = this.value;
                const t = typeof v;

                if (v === null) return null;
                if (t === 'number' || t === 'boolean' || t === 'string') return v;
                if (t === 'undefined') return undefined;
                if (t === 'bigint') {
                    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
                    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
                    if (v >= minSafe && v <= maxSafe) {
                        return Number(v);
                    } else {
                        return v.toString();
                    }
                }

                if (t === 'function') return v.toString();

                try {
                    const s = safeSerialize(v);
                    try {
                        if (DEBUG) console.dir(s);
                        return JSON.parse(s);
                    } catch (_) {

                        return s;
                    }
                } catch (e) {
                    return String(v);
                }
            } catch (e) {
                return String(this.value);
            }
        }

        toString() {
            try {
                const v = this.value;
                if (v === null) return "null";
                if (v === undefined) return "undefined";
                const t = typeof v;
                if (t === "function") {

                    return v.name ? `[Function ${v.name}]` : "[Function]";
                }
                if (t === "object") {

                    try {
                        if (DEBUG) console.dir({
                            safe: safeSerialize(v)
                        });

                        if (Array.isArray(v)) return `[Array(${v.length})]`;
                        if (v && v.constructor && v.constructor.name) return `[${v.constructor.name}]`;
                        return "[Object]";
                    } catch (e) {
                        return v && v.constructor && v.constructor.name ?
                            `[object ${v.constructor.name}]` :
                            "[object]";
                    }
                }

                if (t === 'string') return v;
                return String(v);
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

            try {
                this.value = JSON.parse(edit);
            } catch {
                this.value = edit;
            }
            return this;
        }

        static toType(x) {

            if (x instanceof JSObject) return x;

            // Check if it's a lookup table marker from another extension
            if (x && typeof x === "object" && x._jsoopLookupMarker && x.lookupId) {
                const ext = vm.runtime.ext_jsoop;
                if (ext) {
                    const actualObject = ext._getFromLookupTable(x.lookupId);
                    if (actualObject) {
                        return actualObject;
                    }
                }
            }

            if (x && typeof x === "object" && x.customId && typeof x.customId === "string") {

                try {
                    if (vm && vm.runtime && vm.runtime.serializers && vm.runtime.serializers[x.customId]) {

                        return new JSObject(x);
                    }
                } catch (_) {}
                return new JSObject(x);
            }

            return new JSObject(x);
        }

        static prepareForSerialize(v) {

            // Check if this should be stored in the lookup table
            const ext = vm.runtime.ext_jsoop;
            if (ext && ext._shouldUseLookupTable(v)) {
                const marker = ext._storeInLookupTable(new JSObject(v));
                return {
                    _jsoopLookupMarker: true,
                    lookupId: marker.lookupId
                };
            }

            if (v && typeof v === 'object' && v.customId && vm && vm.runtime && vm.runtime.serializers && vm.runtime.serializers[v.customId]) {
                try {
                    return {
                        _nestedCustom: true,
                        typeId: v.customId,
                        data: vm.runtime.serializers[v.customId].serialize(v)
                    };
                } catch (e) {}
            }

            if (typeof v === 'function') {
                return {
                    _functionSource: v.toString()
                };
            }

            try {
                const json = safeSerialize(v);
                return {
                    _json: json
                };
            } catch (e) {

                return {
                    _string: String(v)
                };
            }
        }

        static reconstructFromSerialize(obj) {
            try {
                if (obj && typeof obj === 'object') {
                    // Handle lookup table markers during deserialization
                    if (obj._jsoopLookupMarker && obj.lookupId) {
                        const ext = vm.runtime.ext_jsoop;
                        if (ext) {
                            const actualObject = ext._getFromLookupTable(obj.lookupId);
                            if (actualObject) {
                                return actualObject;
                            }
                        }
                        // If we can't find it in lookup table (shouldn't happen for runtime objects),
                        // return a placeholder
                        return new JSObject({
                            _jsoopLookupMissing: true,
                            originalLookupId: obj.lookupId
                        });
                    }

                    if (obj._nestedCustom && obj.typeId && vm.runtime.serializers[obj.typeId]) {
                        return vm.runtime.serializers[obj.typeId].deserialize(obj.data);
                    }
                    if (obj._functionSource && typeof obj._functionSource === 'string') {

                        try {

                            const fn = eval('(' + obj._functionSource + ')');
                            return fn;
                        } catch (e) {
                            try {

                                return eval(obj._functionSource);
                            } catch (ee) {
                                return obj._functionSource;
                            }
                        }
                    }
                    if (obj._json) {
                        try {
                            return JSON.parse(obj._json);
                        } catch (e) {

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

    const JSObjectDescriptor = {
        Type: JSObject,
        Block: {
            blockType: Scratch.BlockType.REPORTER,
            blockShape: Scratch.BlockShape.BUMPED,
            forceOutputType: "JSObject",
            disableMonitor: true,
        },
        Argument: {
            shape: Scratch.BlockShape.BUMPED,
            exemptFromNormalization: true,
            check: ["JSObject"]
        }
    };

    class JSOOPExtension {
        constructor() {
            // Internal-only lookup table - users have NO access to this
            this._jsObjectLookup = new Map();
            this._nextLookupId = 1;
            this._lookupTableEnabled = true;

            // Store built-in objects that should always be in lookup table
            this._builtInObjects = new Map();

            if (vm && vm.runtime && typeof vm.runtime.registerCompiledExtensionBlocks === 'function') {
                vm.runtime.registerCompiledExtensionBlocks('jsoop', this.getInfo());
            }

            if (vm && vm.runtime && typeof vm.runtime.registerSerializer === 'function') {
                vm.runtime.registerSerializer(
                    "jsObject",
                    (v) => {

                        if (v instanceof JSObject) {
                            try {
                                const inner = v.value;

                                return {
                                    wrapped: JSObject.prepareForSerialize(inner)
                                };
                            } catch (e) {
                                return {
                                    wrapped: {
                                        _string: String(v.value)
                                    }
                                };
                            }
                        }
                        return null;
                    },
                    (data) => {

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

            if (vm && vm.runtime && typeof vm.runtime.on === "function") {
                vm.runtime.on("workspaceUpdate", () => {
                    codeEditorHandlers.clear();
                    if (!isScratchBlocksReady) {
                        isScratchBlocksReady = typeof ScratchBlocks === "object";
                        if (isScratchBlocksReady) initBlockTools();
                    }
                });
            }

            // Store reference for static methods to access
            this.runtime = Scratch.vm.runtime;
            
            // Pre-populate built-in objects in lookup table
            this._initializeBuiltInObjects();
        }

        // Initialize built-in objects that should always be in lookup table
        _initializeBuiltInObjects() {
            const builtIns = [
                Math, Object, Array, String, Number, Boolean, Function,
                Date, RegExp, JSON, Promise, Error, Map, Set, WeakMap, WeakSet,
                Symbol, Proxy, Reflect, Intl, console, globalThis
            ];
            
            builtIns.forEach(builtIn => {
                const jsObject = new JSObject(builtIn);
                const lookupId = this._generateLookupId();
                this._builtInObjects.set(builtIn, lookupId);
                this._jsObjectLookup.set(lookupId, jsObject);
            });
        }

        // Internal method to generate unique lookup IDs
        _generateLookupId() {
            return `jsoop_${this._nextLookupId++}_${Date.now()}`;
        }

        // Internal method to store JSObject in lookup table and return marker
        _storeInLookupTable(jsObject) {
            if (!this._lookupTableEnabled) return jsObject;

            // Check if this is a built-in object that's already in the lookup table
            const builtInLookupId = this._builtInObjects.get(jsObject.value);
            if (builtInLookupId) {
                return {
                    _jsoopLookupMarker: true,
                    lookupId: builtInLookupId,
                    toString: () => new JSObject().toString.apply({value: this._convertToNativeValue(this._getFromLookupTable(builtInLookupId))}),
                    toJSON: () => ({ _jsoopLookupMarker: true, lookupId: builtInLookupId }),
                };
            }

            const lookupId = this._generateLookupId();
            this._jsObjectLookup.set(lookupId, jsObject);

            if (DEBUG) console.log('Stored JSObject in lookup table:', lookupId, jsObject);

            // Return a marker object that other extensions can store
            return {
                _jsoopLookupMarker: true,
                lookupId: lookupId,
                toString: () => new JSObject().toString.apply({value: this._convertToNativeValue(this._getFromLookupTable(lookupId))}),
                toJSON: () => ({ _jsoopLookupMarker: true, lookupId: lookupId }),
            };
        }

        // Internal method to retrieve JSObject from lookup table
        _getFromLookupTable(lookupId) {
            if (!this._lookupTableEnabled) return null;

            const obj = this._jsObjectLookup.get(lookupId);
            if (DEBUG && obj) console.log('Retrieved JSObject from lookup table:', lookupId, obj);
            return obj;
        }

        // Internal method to determine if an object should use lookup table
        _shouldUseLookupTable(value) {
            if (!this._lookupTableEnabled) return false;
            if (value === null || value === undefined) return false;

            const type = typeof value;

            // Always use lookup table for functions
            if (type === 'function') return true;

            // Check if it's a built-in object
            if (this._isBuiltInObject(value)) return true;

            // For objects, check if they're problematic for serialization
            if (type === 'object') {
                // DOM elements
                if (value instanceof HTMLElement) return true;
                if (value instanceof Node) return true;

                // Built-in objects that don't serialize well
                if (value instanceof Map) return true;
                if (value instanceof Set) return true;
                if (value instanceof WeakMap) return true;
                if (value instanceof WeakSet) return true;
                if (value instanceof Promise) return true;
                if (value instanceof Error) return true;

                // Objects with circular references
                try {
                    JSON.stringify(value);
                } catch (e) {
                    return true; // Can't serialize, use lookup table
                }

                // Large objects might be better in lookup table
                if (Object.keys(value).length > 100) return true;
                
                // Objects with methods/properties that can't be serialized
                if (this._hasUnserializableProperties(value)) return true;
            }

            return false;
        }

        // Check if an object is a built-in JavaScript object
        _isBuiltInObject(value) {
            if (value === null || value === undefined) return false;
            
            // Check against known built-in objects
            const builtIns = [
                Math, Object, Array, String, Number, Boolean, Function,
                Date, RegExp, JSON, Promise, Error, Map, Set, WeakMap, WeakSet,
                Symbol, Proxy, Reflect, Intl, console, globalThis
            ];
            
            return builtIns.includes(value);
        }

        // Check if an object has properties that can't be properly serialized
        _hasUnserializableProperties(obj) {
            try {
                const props = Object.getOwnPropertyNames(obj);
                for (const prop of props) {
                    try {
                        const value = obj[prop];
                        if (typeof value === 'function') return true;
                        if (value && typeof value === 'object') {
                            JSON.stringify(value);
                        }
                    } catch (e) {
                        return true;
                    }
                }
            } catch (e) {
                return true;
            }
            return false;
        }

        // Internal method to automatically handle JSObjects for other extensions
        _wrapForOtherExtensions(jsObject) {
            if (!this._lookupTableEnabled) return jsObject;

            if (jsObject instanceof JSObject) {
                const innerValue = jsObject.value;
                if (this._shouldUseLookupTable(innerValue)) {
                    return this._storeInLookupTable(jsObject);
                }
            }

            return jsObject;
        }

        // NEW: Ensure we always resolve JSObject references before using them
        _resolveJSObject(obj) {
            if (obj instanceof JSObject) {
                return obj.value;
            }
            
            // Handle lookup table markers
            if (obj && typeof obj === "object" && obj._jsoopLookupMarker && obj.lookupId) {
                const actualObject = this._getFromLookupTable(obj.lookupId);
                if (actualObject instanceof JSObject) {
                    return actualObject.value;
                }
            }
            
            return obj;
        }

        // NEW: Get the actual value from any JSObject or marker
        _getActualValue(value) {
            if (value instanceof JSObject) {
                return value.value;
            }
            
            // Handle lookup table markers
            if (value && typeof value === "object" && value._jsoopLookupMarker && value.lookupId) {
                const actualObject = this._getFromLookupTable(value.lookupId);
                if (actualObject instanceof JSObject) {
                    return actualObject.value;
                }
            }
            
            return value;
        }

        // NEW: Error handling wrapper that always forwards to console.error
        _handleError(error, context) {
            console.error(`JS OOP Error in ${context}:`, error);
            return error;
        }

        // NEW: Safe execution wrapper that catches and forwards all errors
        _safeExecute(fn, context, ...args) {
            try {
                return fn.apply(this, args);
            } catch (error) {
                throw this._handleError(error, context);
            }
        }

        // NEW: Safe async execution wrapper
        async _safeExecuteAsync(fn, context, ...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                throw this._handleError(error, context);
            }
        }

        getInfo() {
            // ... (blocks array remains exactly the same as in the previous version)
            const blocks = [
                {
                    opcode: "codeInput",
                    color1: "#6b8cff",
                    color2: "#6b8cff",
                    color3: "#6b8cff",
                    text: "[CODE]",
                    blockType: Scratch.BlockType.REPORTER,
                    blockShape: Scratch.BlockShape.SQUARE,
                    hideFromPalette: true,
                    arguments: {
                        CODE: {
                            type: Scratch.ArgumentType.CUSTOM,
                            id: "jsoop-codeEditor",
                            defaultValue: "jsoop-init-xyz789@!"
                        }
                    },
                },
                {
                    opcode: "argsReporter",
                    text: "args",
                    blockType: Scratch.BlockType.REPORTER,
                    hideFromPalette: true,
                    canDragDuplicate: true,
                    allowDropAnywhere: true,
                    disableMonitor: true,
                },
                {
                    opcode: 'evalJS',
                    color1: "#6b8cff",
                    color2: "#6b8cff",
                    color3: "#6b8cff",
                    blockType: Scratch.BlockType.REPORTER,
                    text: 'eval JS [CODE]',
                    arguments: {
                        CODE: {
                            fillIn: "codeInput"
                        }
                    },
                    ...JSObjectDescriptor.Block
                },
                {
                    opcode: 'runJS',
                    color1: "#6b8cff",
                    color2: "#6b8cff",
                    color3: "#6b8cff",
                    blockType: Scratch.BlockType.COMMAND,
                    text: 'run JS [CODE]',
                    arguments: {
                        CODE: {
                            fillIn: "codeInput"
                        }
                    }
                },
                {
                    opcode: 'jsCommand',
                    text: 'run [CODE]',
                    blockType: Scratch.BlockType.COMMAND,
                    hideFromPalette: isScratchBlocksReady && !isSafari,
                    arguments: {
                        CODE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: `console.log("Hello!")`
                        }
                    }
                },
                {
                    opcode: 'jsReporter',
                    text: 'run [CODE]',
                    blockType: Scratch.BlockType.REPORTER,
                    disableMonitor: true,
                    allowDropAnywhere: true,
                    hideFromPalette: isScratchBlocksReady && !isSafari,
                    arguments: {
                        CODE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'Math.random()'
                        }
                    }
                },
                {
                    opcode: "functionHatNotice",
                    blockType: Scratch.BlockType.BUTTON,
                    text: "Notice, read me!"
                },
                {
                    opcode: 'functionHat',
                    text: 'when function [LABEL] is called [ARGS]',
                    blockType: Scratch.BlockType.HAT,
                    isEdgeActivated: false,
                    hideFromPalette: true,
                    arguments: {
                        LABEL: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'myFunction',
                        },
                        ARGS: {
                            fillIn: "argsReporter"
                        }
                    }
                },
                {
                    blockType: Scratch.BlockType.XML,
                    hideFromPalette: false,
                    xml: `
                    <block type="jsoop_functionHat">
                      <value name="LABEL"><shadow type="text"><field name="TEXT">myFunction</field></shadow></value>
                      <value name="ARGS"><shadow type="jsoop_argsReporter"></shadow></value>
                      <next>
                        <block type="jsoop_returnDataString">
                          <value name="DATA"><shadow type="text"><field name="TEXT">foobar</field></shadow></value>
                        </block>
                      </next>
                    </block>
                  `
                },
                {
                    opcode: 'functionReporter',
                    text: 'generate function for label [LABEL]',
                    blockType: Scratch.BlockType.REPORTER,
                    arguments: {
                        LABEL: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'myFunction',
                        }
                    },
                    ...JSObjectDescriptor.Block
                },
                {
                    opcode: "returnDataString",
                    blockType: Scratch.BlockType.COMMAND,
                    isTerminal: true,
                    hideFromPalette: false,
                    text: "return [DATA]",
                    arguments: {
                        DATA: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: "foobar"
                        }
                    },
                },
                {
                    opcode: "returnDataObject",
                    blockType: Scratch.BlockType.COMMAND,
                    isTerminal: true,
                    hideFromPalette: false,
                    text: "return [DATA]",
                    arguments: {
                        DATA: {
                            ...(vm.dogeiscutObject ? {
                                ...vm.dogeiscutObject.Argument,
                            } : {
                                ...({
                                    shape: 5,
                                    exemptFromNormalization: true,
                                    check: ["Object"]
                                })
                            }),
                            defaultValue: vm.dogeiscutObject ? vm.dogeiscutObject.Type.defaultValue : undefined
                        },
                    },
                },
                {
                    opcode: "returnDataArray",
                    blockType: Scratch.BlockType.COMMAND,
                    isTerminal: true,
                    hideFromPalette: false,
                    text: "return [DATA]",
                    arguments: {
                        DATA: {
                            ...jwArray.Argument,
                            defaultValue: new jwArray.Type([])
                        }
                    },
                },
                {
                    opcode: "returnDataJsObject",
                    blockType: Scratch.BlockType.COMMAND,
                    isTerminal: true,
                    hideFromPalette: false,
                    text: "return [DATA]",
                    arguments: {
                        DATA: JSObjectDescriptor.Argument
                    },
                },
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
                    ...JSObjectDescriptor.Block
                },
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
                {
                    opcode: 'awaitRunMethod',
                    blockType: Scratch.BlockType.COMMAND,
                    text: 'await run method [METHOD] on [INSTANCE] with args [ARGS]',
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
                    }
                },
                {
                    opcode: 'callFunction',
                    blockType: Scratch.BlockType.REPORTER,
                    text: 'call function [FUNC] with this [THIS] args [ARGS]',
                    arguments: {
                        FUNC: JSObjectDescriptor.Argument,
                        THIS: {
                            ...(vm.dogeiscutObject ? {
                                ...vm.dogeiscutObject.Argument,
                            } : {
                                ...({
                                    shape: 5,
                                    exemptFromNormalization: true,
                                    check: ["Object"]
                                })
                            }),
                            defaultValue: vm.dogeiscutObject ? vm.dogeiscutObject.Type.defaultValue : undefined
                        },
                        ARGS: {
                            ...jwArray.Argument,
                            defaultValue: new jwArray.Type([])
                        }
                    },
                    ...JSObjectDescriptor.Block
                },
                {
                    opcode: 'awaitCallFunction',
                    blockType: Scratch.BlockType.REPORTER,
                    text: 'await call function [FUNC] with this [THIS] args [ARGS]',
                    arguments: {
                        FUNC: JSObjectDescriptor.Argument,
                        THIS: {
                            ...(vm.dogeiscutObject ? {
                                ...vm.dogeiscutObject.Argument,
                            } : {
                                ...({
                                    shape: 5,
                                    exemptFromNormalization: true,
                                    check: ["Object"]
                                })
                            }),
                            defaultValue: vm.dogeiscutObject ? vm.dogeiscutObject.Type.defaultValue : undefined
                        },
                        ARGS: {
                            ...jwArray.Argument,
                            defaultValue: new jwArray.Type([])
                        }
                    },
                    ...JSObjectDescriptor.Block
                },
                {
                    opcode: 'runFunction',
                    blockType: Scratch.BlockType.COMMAND,
                    text: 'run function [FUNC] with this [THIS] args [ARGS]',
                    arguments: {
                        FUNC: JSObjectDescriptor.Argument,
                        THIS: {
                            ...(vm.dogeiscutObject ? {
                                ...vm.dogeiscutObject.Argument,
                            } : {
                                ...({
                                    shape: 5,
                                    exemptFromNormalization: true,
                                    check: ["Object"]
                                })
                            }),
                            defaultValue: vm.dogeiscutObject ? vm.dogeiscutObject.Type.defaultValue : undefined
                        },
                        ARGS: {
                            ...jwArray.Argument,
                            defaultValue: new jwArray.Type([])
                        }
                    }
                },
                {
                    opcode: 'awaitRunFunction',
                    blockType: Scratch.BlockType.COMMAND,
                    text: 'await run function [FUNC] with this [THIS] args [ARGS]',
                    arguments: {
                        FUNC: JSObjectDescriptor.Argument,
                        THIS: {
                            ...(vm.dogeiscutObject ? {
                                ...vm.dogeiscutObject.Argument,
                            } : {
                                ...({
                                    shape: 5,
                                    exemptFromNormalization: true,
                                    check: ["Object"]
                                })
                            }),
                            defaultValue: vm.dogeiscutObject ? vm.dogeiscutObject.Type.defaultValue : undefined
                        },
                        ARGS: {
                            ...jwArray.Argument,
                            defaultValue: new jwArray.Type([])
                        }
                    }
                },
                {
                    opcode: 'getProp',
                    blockType: Scratch.BlockType.REPORTER,
                    text: 'get property [PROP] of [INSTANCE]',
                    allowDropAnywhere: true,
                    arguments: {
                        PROP: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'name',
                            exemptFromNormalization: true
                        },
                        INSTANCE: JSObjectDescriptor.Argument
                    }
                },
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
                {
                    opcode: 'typeName',
                    blockType: Scratch.BlockType.REPORTER,
                    text: 'type name of [INSTANCE]',
                    arguments: {
                        INSTANCE: JSObjectDescriptor.Argument
                    }
                },
                {
                    opcode: 'toNative',
                    blockType: Scratch.BlockType.REPORTER,
                    text: 'Convert to native JavaScript value [VALUE]',
                    allowDropAnywhere: true,
                    arguments: {
                        VALUE: JSObjectDescriptor.Argument
                    }
                },
                {
                    opcode: 'separator2',
                    blockType: Scratch.BlockType.LABEL,
                    text: 'Property Changing Blocks'
                },
                {
                    opcode: "propSettingNotice",
                    blockType: Scratch.BlockType.BUTTON,
                    text: "Notice, read me!"
                },
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
                {
                    opcode: 'setPropJSObject',
                    blockType: Scratch.BlockType.COMMAND,
                    text: 'set property [PROP] of [INSTANCE] to JavaScript Object [VALUE]',
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
                {
                    opcode: 'setPropJwArray',
                    blockType: Scratch.BlockType.COMMAND,
                    text: 'set property [PROP] of [INSTANCE] to Array [VALUE]',
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
                {
                    opcode: 'setPropDogeiscutObject',
                    blockType: Scratch.BlockType.COMMAND,
                    text: 'set property [PROP] of [INSTANCE] to Object [VALUE]',
                    arguments: {
                        PROP: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: 'config',
                            exemptFromNormalization: true
                        },
                        INSTANCE: JSObjectDescriptor.Argument,
                        VALUE: vm.dogeiscutObject ? {
                            ...vm.dogeiscutObject.Argument,
                        } : {
                            ...({
                                shape: 5,
                                exemptFromNormalization: true,
                                check: ["Object"]
                            })
                        }
                    }
                },
                {
                    opcode: 'separator1',
                    blockType: Scratch.BlockType.LABEL,
                    text: 'Common JavaScript Constants'
                },
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
            ];

            return {
                id: 'jsoop',
                name: 'JS OOP',
                color1: '#6b8cff',
                color2: '#4968d9',
                color3: '#334fb7',
                blocks: blocks
            };
        }

        async functionHat(args, util) {
            const label = Scratch.Cast.toString(args.LABEL);
            const thread = util.thread;
        
            thread.functionHatLabel = label;
        
            //
            // DON'T DO ANYTHING until reporter arms this thread
            //
            while (!thread.armed) {
                await new Promise(r => setTimeout(r, 0));
            }
        
            //
            // Once armed, if labels don't match → exit immediately
            //
            if (thread.targetHatLabel !== label) {
                return false; // do not run block stack
            }
        
            //
            // Normal matching hat behavior
            //
            // Clear triggering
            thread.targetHatLabel = undefined;
            return true;
        }


        functionReporter(args) {
            const label = Scratch.Cast.toString(args.LABEL);
        
            const triggerFunction = (...functionArgs) => {
                const allThreads = vm.runtime.startHats("jsoop_functionHat");
        
                // Only hats with same LABEL
                const matchingThreads = allThreads.filter(t => t.functionHatLabel === label);
        
                // Arm matching hats first
                for (const t of matchingThreads) {
                    t.targetHatLabel = label;
                    t.jsoopArgs = new jwArray.Type(functionArgs);
                    t.armed = true;   // LET THEM RUN
                }
        
                // Arm non-matching hats
                for (const t of allThreads) {
                    if (!t.armed) {
                        t.targetHatLabel = null;
                        t.armed = true;  // They will exit immediately
                    }
                }
        
                return new Promise(resolve => {
                    let remaining = matchingThreads.length;
                    let lastResult;
        
                    const check = () => {
                        for (const t of matchingThreads) {
                            if (t.__done) continue;
        
                            if (t.justReported !== undefined && t.justReported !== null) {
                                lastResult = t.justReported;
                                t.justReported = undefined;
                                t.__done = true;
                                remaining--;
                            }
                        }
        
                        if (remaining === 0) {
                            resolve(lastResult);
                        } else {
                            setTimeout(check, 5);
                        }
                    };
        
                    check();
                });
            };
        
            return this._wrapForOtherExtensions(new JSObject(triggerFunction));
        }




        // Return blocks
        returnDataString(args, util) {
            util.thread.justReported = Scratch.Cast.toString(args.DATA);
            util.thread.stopThisScript();
        }
        returnDataObject(args, util) {
            util.thread.justReported = args.DATA;
            util.thread.stopThisScript();
        }
        returnDataArray(args, util) {
            util.thread.justReported = args.DATA;
            util.thread.stopThisScript();
        }
        returnDataJsObject(args, util) {
            util.thread.justReported = args.DATA;
            util.thread.stopThisScript();
        }

        // Arguments reporter
        argsReporter(_, util) {
            const args = util.thread.jsoopArgs || new JSObject(undefined);
            return this._wrapForOtherExtensions(args);
        }

        toNative(args) {
            return this._convertToNativeValue(args.VALUE);
        }

        _wrapMaybe(x) {
            if (x instanceof JSObject) return x;
            if (x && typeof x === 'object' && x.customId) return new JSObject(x);
            return new JSObject(x);
        }

        _convertJwArrayToArgs(jwArrayObj) {
            if (jwArrayObj instanceof jwArray.Type) {
                return jwArrayObj.array.map(item => {
                    // Resolve any JSObject references in the array
                    return this._convertToNativeValue(item);
                });
            }
            return [];
        }

        _convertResultToJwArray(result) {
            if (Array.isArray(result) && !(result instanceof jwArray.Type)) {
                return new jwArray.Type(result);
            }
            return result;
        }

        _convertToNativeValue(value) {
            if (value && typeof value === 'object' && value.object && value.customId === 'dogeiscutObject') {
                return value.object;
            }

            if (value && typeof value === 'object' && value.array && value.customId === 'jwArray') {
                return value.array;
            }

            // Always resolve JSObject references
            return this._getActualValue(value);
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

        functionHatNotice() {
            alert('Make sure to use the "await" version of the call method/function blocks when a function hat block returns a value, it returns a JavaScript Promise since the hat may not immediately return.');
        }

        propSettingNotice() {
            alert("These property settings block are to be used with JavaScript Objects stored in variables. They modify them in place!");
        }

        codeInput(args) {
            return args.CODE;
        }

        constantMath() {
            // Math is now automatically stored in lookup table during initialization
            return this._wrapForOtherExtensions(new JSObject(Math));
        }

        constantNull() {
            return this._wrapForOtherExtensions(new JSObject(null));
        }

        constantUndefined() {
            return this._wrapForOtherExtensions(new JSObject(undefined));
        }

        constantObject() {
            return this._wrapForOtherExtensions(new JSObject(Object));
        }

        constantArray() {
            return this._wrapForOtherExtensions(new JSObject(Array));
        }

        constantString() {
            return this._wrapForOtherExtensions(new JSObject(String));
        }

        constantNumber() {
            return this._wrapForOtherExtensions(new JSObject(Number));
        }

        constantBoolean() {
            return this._wrapForOtherExtensions(new JSObject(Boolean));
        }

        constantFunction() {
            return this._wrapForOtherExtensions(new JSObject(Function));
        }

        constantAsyncFunction() {
            return this._wrapForOtherExtensions(new JSObject(Object.getPrototypeOf(async function () {}).constructor));
        }

        constantDate() {
            return this._wrapForOtherExtensions(new JSObject(Date));
        }

        constantRegExp() {
            return this._wrapForOtherExtensions(new JSObject(RegExp));
        }

        constantJSON() {
            return this._wrapForOtherExtensions(new JSObject(JSON));
        }

        constantPromise() {
            return this._wrapForOtherExtensions(new JSObject(Promise));
        }

        constantError() {
            return this._wrapForOtherExtensions(new JSObject(Error));
        }

        constantMap() {
            return this._wrapForOtherExtensions(new JSObject(Map));
        }

        constantSet() {
            return this._wrapForOtherExtensions(new JSObject(Set));
        }

        constantWeakMap() {
            return this._wrapForOtherExtensions(new JSObject(WeakMap));
        }

        constantWeakSet() {
            return this._wrapForOtherExtensions(new JSObject(WeakSet));
        }

        constantSymbol() {
            return this._wrapForOtherExtensions(new JSObject(Symbol));
        }

        constantProxy() {
            return this._wrapForOtherExtensions(new JSObject(Proxy));
        }

        constantReflect() {
            return this._wrapForOtherExtensions(new JSObject(Reflect));
        }

        constantIntl() {
            return this._wrapForOtherExtensions(new JSObject(Intl));
        }

        constantConsole() {
            return this._wrapForOtherExtensions(new JSObject(console));
        }

        constantGlobalThis() {
            return this._wrapForOtherExtensions(new JSObject(globalThis));
        }

        constantInfinity() {
            return this._wrapForOtherExtensions(new JSObject(Infinity));
        }

        constantNaN() {
            return this._wrapForOtherExtensions(new JSObject(NaN));
        }

        evalJS({
            CODE
        }) {
            if (DEBUG) console.dir({
                action: 'evalJS(entry)',
                CODE
            });
            try {
                const fn = new Function('"use strict"; return (function(){ ' + CODE + ' })()');
                const result = fn();
                if (DEBUG) console.dir({
                    action: 'evalJS(resultRaw)',
                    result
                });
                const wrapped = JSObject.toType(result);
                if (DEBUG) console.dir({
                    action: 'evalJS(wrapped)',
                    wrapped
                });
                return this._wrapForOtherExtensions(wrapped);
            } catch (err) {
                console.error('JS OOP Error in evalJS:', err);
                if (DEBUG) console.dir({
                    action: 'evalJS(error)',
                    error: err
                });

                return this._wrapForOtherExtensions(new JSObject({
                    error: String(err)
                }));
            }
        }

        runJS({
            CODE
        }) {
            if (DEBUG) console.dir({
                action: 'runJS(entry)',
                CODE
            });
            try {
                const fn = new Function('"use strict"; ' + CODE);
                fn();
                if (DEBUG) console.dir({
                    action: 'runJS(done)'
                });
            } catch (err) {
                console.error('JS OOP Error in runJS:', err);
                if (DEBUG) console.dir({
                    action: 'runJS(error)',
                    error: err
                });
            }
        }

        jsCommand({
            CODE
        }) {
            return this.runJS({
                CODE
            });
        }

        jsReporter({
            CODE
        }) {
            return this.evalJS({
                CODE
            });
        }

        new({
            CONSTRUCTOR,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'new(entry)',
                CONSTRUCTOR,
                ARGS
            });
            try {
                const ctorWrap = JSObject.toType(CONSTRUCTOR);
                const ctor = this._getActualValue(ctorWrap); // Resolve constructor reference
                const args = this._convertJwArrayToArgs(ARGS);
                if (typeof ctor !== 'function') {
                    return this._wrapForOtherExtensions(new JSObject({
                        error: 'Constructor is not a function'
                    }));
                }
                try {
                    const instance = Reflect.construct(ctor, args);
                    if (DEBUG) console.dir({
                        action: 'new(result)',
                        instance
                    });
                    const result = JSObject.toType(instance);
                    return this._wrapForOtherExtensions(this._convertResultToJwArray(result));
                } catch (err) {
                    console.error('JS OOP Error in new:', err);
                    if (DEBUG) console.dir({
                        action: 'new(error)',
                        error: err
                    });
                    return this._wrapForOtherExtensions(new JSObject({
                        error: String(err)
                    }));
                }
            } catch (err) {
                console.error('JS OOP Error in new (outer):', err);
                if (DEBUG) console.dir({
                    action: 'new(errorOuter)',
                    error: err
                });
                return this._wrapForOtherExtensions(new JSObject({
                    error: String(err)
                }));
            }
        }

        callMethod({
            METHOD,
            INSTANCE,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'callMethod(entry)',
                METHOD,
                INSTANCE,
                ARGS
            });

            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference
            
            const args = this._convertJwArrayToArgs(ARGS);

            if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
                const primProto = Object.getPrototypeOf(target);
                const fnPrim = primProto && primProto[METHOD];
                if (typeof fnPrim === 'function') {
                    try {
                        const result = fnPrim.apply(target, args);
                        if (DEBUG) console.dir({
                            action: 'callMethod(resultPrimitive)',
                            result
                        });
                        const wrappedResult = JSObject.toType(result);
                        return this._wrapForOtherExtensions(this._convertResultToJwArray(wrappedResult));
                    } catch (err) {
                        console.error('JS OOP Error in callMethod (primitive):', err);
                        if (DEBUG) console.dir({
                            action: 'callMethod(errorPrimitive)',
                            error: err
                        });
                        return this._wrapForOtherExtensions(new JSObject({
                            error: String(err)
                        }));
                    }
                }
                return this._wrapForOtherExtensions(new JSObject({
                    error: `No method ${METHOD} on target`
                }));
            }

            const fn = target[METHOD];
            if (typeof fn !== 'function') {
                const proto = Object.getPrototypeOf(target);
                const fnProto = proto && proto[METHOD];
                if (typeof fnProto === 'function') {
                    try {
                        const result = fnProto.apply(target, args);
                        if (DEBUG) console.dir({
                            action: 'callMethod(resultProto)',
                            result
                        });
                        const wrappedResult = JSObject.toType(result);
                        return this._wrapForOtherExtensions(this._convertResultToJwArray(wrappedResult));
                    } catch (err) {
                        console.error('JS OOP Error in callMethod (proto):', err);
                        if (DEBUG) console.dir({
                            action: 'callMethod(errorProto)',
                            error: err
                        });
                        return this._wrapForOtherExtensions(new JSObject({
                            error: String(err)
                        }));
                    }
                }

                return this._wrapForOtherExtensions(new JSObject({
                    error: `No method ${METHOD}`
                }));
            }

            try {
                const result = fn.apply(target, args);
                if (DEBUG) console.dir({
                    action: 'callMethod(result)',
                    result
                });
                return this._wrapForOtherExtensions(this._convertResultToJwArray(this._convertToNativeValue(result)));
            } catch (err) {
                console.error('JS OOP Error in callMethod:', err);
                if (DEBUG) console.dir({
                    action: 'callMethod(error)',
                    error: err
                });
                return this._wrapForOtherExtensions(new JSObject({
                    error: String(err)
                }));
            }
        }

        async awaitCallMethod({
            METHOD,
            INSTANCE,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'awaitCallMethod(entry)',
                METHOD,
                INSTANCE,
                ARGS
            });

            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference
            const args = this._convertJwArrayToArgs(ARGS);

            if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
                const primProto = Object.getPrototypeOf(target);
                const fnPrim = primProto && primProto[METHOD];
                if (typeof fnPrim === 'function') {
                    try {
                        const res = fnPrim.apply(target, args);
                        if (res && typeof res.then === 'function') {
                            const awaited = await res;
                            if (DEBUG) console.dir({
                                action: 'awaitCallMethod(resultPrimitiveAwaited)',
                                awaited
                            });
                            const wrappedResult = JSObject.toType(awaited);
                            return this._wrapForOtherExtensions(this._convertResultToJwArray(wrappedResult));
                        }
                        if (DEBUG) console.dir({
                            action: 'awaitCallMethod(resultPrimitive)',
                            res
                        });
                        const wrappedResult = JSObject.toType(res);
                        return this._wrapForOtherExtensions(this._convertResultToJwArray(wrappedResult));
                    } catch (err) {
                        console.error('JS OOP Error in awaitCallMethod (primitive):', err);
                        if (DEBUG) console.dir({
                            action: 'awaitCallMethod(errorPrimitive)',
                            error: err
                        });
                        return this._wrapForOtherExtensions(new JSObject({
                            error: String(err)
                        }));
                    }
                }
                return this._wrapForOtherExtensions(new JSObject({
                    error: `No method ${METHOD} on target`
                }));
            }

            let fn = target[METHOD];
            if (typeof fn !== 'function') {
                const proto = Object.getPrototypeOf(target);
                fn = proto && proto[METHOD];
            }
            if (typeof fn !== 'function') {
                return this._wrapForOtherExtensions(new JSObject({
                    error: `No method ${METHOD}`
                }));
            }

            try {
                const result = fn.apply(target, args);
                if (result && typeof result.then === 'function') {
                    const awaited = await result;
                    if (DEBUG) console.dir({
                        action: 'awaitCallMethod(awaited)',
                        awaited
                    });
                    const wrappedResult = JSObject.toType(awaited);
                    return this._wrapForOtherExtensions(this._convertResultToJwArray(wrappedResult));
                }
                if (DEBUG) console.dir({
                    action: 'awaitCallMethod(result)',
                    result
                });
                return this._wrapForOtherExtensions(this._convertResultToJwArray(this._convertToNativeValue(result)));
            } catch (err) {
                console.error('JS OOP Error in awaitCallMethod:', err);
                if (DEBUG) console.dir({
                    action: 'awaitCallMethod(error)',
                    error: err
                });
                return this._wrapForOtherExtensions(new JSObject({
                    error: String(err)
                }));
            }
        }

        runMethod({
            METHOD,
            INSTANCE,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'runMethod(entry)',
                METHOD,
                INSTANCE,
                ARGS
            });
            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference
            const args = this._convertJwArrayToArgs(ARGS);

            if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
                const primProto = Object.getPrototypeOf(target);
                const fnPrim = primProto && primProto[METHOD];
                if (typeof fnPrim === 'function') {
                    try {
                        fnPrim.apply(target, args);
                        if (DEBUG) console.dir({
                            action: 'runMethod(donePrimitive)'
                        });
                        return;
                    } catch (err) {
                        console.error('JS OOP Error in runMethod (primitive):', err);
                        if (DEBUG) console.dir({
                            action: 'runMethod(errorPrimitive)',
                            error: err
                        });
                        return;
                    }
                }
                if (DEBUG) console.dir({
                    action: 'runMethod(noMethod)'
                });
                return;
            }

            const fn = target[METHOD] || (Object.getPrototypeOf(target) && Object.getPrototypeOf(target)[METHOD]);
            if (typeof fn === 'function') {
                try {
                    fn.apply(target, args);
                    if (DEBUG) console.dir({
                        action: 'runMethod(done'
                    });
                } catch (err) {
                    console.error('JS OOP Error in runMethod:', err);
                    if (DEBUG) console.dir({
                        action: 'runMethod(error)',
                        error: err
                    });
                }
            } else {
                if (DEBUG) console.dir({
                    action: 'runMethod(noMethod)',
                    METHOD
                });
            }
        }

        callFunction({
            FUNC,
            THIS,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'callFunction(entry)',
                FUNC,
                THIS,
                ARGS
            });

            try {
                const funcWrap = JSObject.toType(FUNC);
                const func = this._getActualValue(funcWrap); // Resolve function reference
                const thisArg = THIS ? this._convertToNativeValue(THIS) : undefined;
                const args = this._convertJwArrayToArgs(ARGS);

                if (typeof func !== 'function') {
                    return this._wrapForOtherExtensions(new JSObject({
                        error: 'FUNC is not a function'
                    }));
                }

                const result = func.apply(thisArg, args);
                if (DEBUG) console.dir({
                    action: 'callFunction(result)',
                    result
                });

                return this._wrapForOtherExtensions(this._convertResultToJwArray(this._convertToNativeValue(result)));
            } catch (err) {
                console.error('JS OOP Error in callFunction:', err);
                if (DEBUG) console.dir({
                    action: 'callFunction(error)',
                    error: err
                });
                return this._wrapForOtherExtensions(new JSObject({
                    error: String(err)
                }));
            }
        }

        async awaitCallFunction({
            FUNC,
            THIS,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'awaitCallFunction(entry)',
                FUNC,
                THIS,
                ARGS
            });

            try {
                const funcWrap = JSObject.toType(FUNC);
                const func = this._getActualValue(funcWrap); // Resolve function reference
                const thisArg = THIS ? this._convertToNativeValue(THIS) : undefined;
                const args = this._convertJwArrayToArgs(ARGS);

                if (typeof func !== 'function') {
                    return this._wrapForOtherExtensions(new JSObject({
                        error: 'FUNC is not a function'
                    }));
                }

                let result = func.apply(thisArg, args);
                if (result && typeof result.then === 'function') {
                    result = await result;
                }

                if (DEBUG) console.dir({
                    action: 'awaitCallFunction(result)',
                    result
                });

                //const wrappedResult = JSObject.toType(result);
                return this._wrapForOtherExtensions(this._convertResultToJwArray(this._convertToNativeValue(result)));
            } catch (err) {
                console.error('JS OOP Error in awaitCallFunction:', err);
                if (DEBUG) console.dir({
                    action: 'awaitCallFunction(error)',
                    error: err
                });
                return this._wrapForOtherExtensions(new JSObject({
                    error: String(err)
                }));
            }
        }

        runFunction({
            FUNC,
            THIS,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'runFunction(entry)',
                FUNC,
                THIS,
                ARGS
            });

            try {
                const funcWrap = JSObject.toType(FUNC);
                const func = this._getActualValue(funcWrap); // Resolve function reference
                const thisArg = THIS ? this._convertToNativeValue(THIS) : undefined;
                const args = this._convertJwArrayToArgs(ARGS);

                if (typeof func !== 'function') {
                    if (DEBUG) console.dir({
                        action: 'runFunction(notFunction)'
                    });
                    return;
                }

                func.apply(thisArg, args);
                if (DEBUG) console.dir({
                    action: 'runFunction(done)'
                });
            } catch (err) {
                console.error('JS OOP Error in runFunction:', err);
                if (DEBUG) console.dir({
                    action: 'runFunction(error)',
                    error: err
                });
            }
        }

        async awaitRunFunction({
            FUNC,
            THIS,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'awaitRunFunction(entry)',
                FUNC,
                THIS,
                ARGS
            });

            try {
                const funcWrap = JSObject.toType(FUNC);
                const func = this._getActualValue(funcWrap); // Resolve function reference
                const thisArg = THIS ? this._convertToNativeValue(THIS) : undefined;
                const args = this._convertJwArrayToArgs(ARGS);

                if (typeof func !== 'function') {
                    if (DEBUG) console.dir({
                        action: 'awaitRunFunction(notFunction)'
                    });
                    return;
                }

                let result = func.apply(thisArg, args);
                if (result && typeof result.then === 'function') {
                    await result;
                }

                if (DEBUG) console.dir({
                    action: 'awaitRunFunction(done)'
                });
            } catch (err) {
                console.error('JS OOP Error in awaitRunFunction:', err);
                if (DEBUG) console.dir({
                    action: 'awaitRunFunction(error)',
                    error: err
                });
            }
        }

        async awaitRunMethod({
            METHOD,
            INSTANCE,
            ARGS
        }) {
            if (DEBUG) console.dir({
                action: 'awaitRunMethod(entry)',
                METHOD,
                INSTANCE,
                ARGS
            });

            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference
            const args = this._convertJwArrayToArgs(ARGS);

            if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
                const primProto = Object.getPrototypeOf(target);
                const fnPrim = primProto && primProto[METHOD];
                if (typeof fnPrim === 'function') {
                    try {
                        let result = fnPrim.apply(target, args);
                        if (result && typeof result.then === 'function') {
                            await result;
                        }
                        if (DEBUG) console.dir({
                            action: 'awaitRunMethod(donePrimitive)'
                        });
                        return;
                    } catch (err) {
                        console.error('JS OOP Error in awaitRunMethod (primitive):', err);
                        if (DEBUG) console.dir({
                            action: 'awaitRunMethod(errorPrimitive)',
                            error: err
                        });
                        return;
                    }
                }
                if (DEBUG) console.dir({
                    action: 'awaitRunMethod(noMethod)'
                });
                return;
            }

            const fn = target[METHOD] || (Object.getPrototypeOf(target) && Object.getPrototypeOf(target)[METHOD]);
            if (typeof fn === 'function') {
                try {
                    let result = fn.apply(target, args);
                    if (result && typeof result.then === 'function') {
                        await result;
                    }
                    if (DEBUG) console.dir({
                        action: 'awaitRunMethod(done)'
                    });
                } catch (err) {
                    console.error('JS OOP Error in awaitRunMethod:', err);
                    if (DEBUG) console.dir({
                        action: 'awaitRunMethod(error)',
                        error: err
                    });
                }
            } else {
                if (DEBUG) console.dir({
                    action: 'awaitRunMethod(noMethod)',
                    METHOD
                });
            }
        }

        getProp({
            PROP,
            INSTANCE
        }) {
            if (DEBUG) console.dir({
                action: 'getProp(entry)',
                PROP,
                INSTANCE
            });
            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference

            try {
                const val = target[PROP];
                if (DEBUG) console.dir({
                    action: 'getProp(result)',
                    val
                });
                return this._getActualValue(this._convertToNativeValue(val));
            } catch (err) {
                console.error('JS OOP Error in getProp:', err);
                if (DEBUG) console.dir({
                    action: 'getProp(error)',
                    error: err
                });
                return `[Error: ${String(err)}]`;
            }
        }

        setPropString({
            PROP,
            INSTANCE,
            VALUE
        }) {
            if (DEBUG) console.dir({
                action: 'setPropString(entry)',
                PROP,
                INSTANCE,
                VALUE
            });
            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference

            let parsed;
            try {
                parsed = JSON.parse(VALUE);
            } catch {
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
                    const newObj = Object(target);
                    newObj[PROP] = parsed;
                    INSTANCE.value = newObj;
                }
                if (DEBUG) console.dir({
                    action: 'setPropString(done)',
                    target: INSTANCE.value
                });
            } catch (err) {
                console.error('JS OOP Error in setPropString:', err);
                if (DEBUG) console.dir({
                    action: 'setPropString(error)',
                    error: err
                });
            }
        }

        setPropJSObject({
            PROP,
            INSTANCE,
            VALUE
        }) {
            if (DEBUG) console.dir({
                action: 'setPropJSObject(entry)',
                PROP,
                INSTANCE,
                VALUE
            });
            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference
            const value = this._convertToNativeValue(VALUE);

            try {
                if (target && (typeof target === 'object' || typeof target === 'function')) {
                    target[PROP] = value;
                } else {
                    const newObj = Object(target);
                    newObj[PROP] = value;
                    INSTANCE.value = newObj;
                }
                if (DEBUG) console.dir({
                    action: 'setPropJSObject(done)',
                    target: INSTANCE.value
                });
            } catch (err) {
                console.error('JS OOP Error in setPropJSObject:', err);
                if (DEBUG) console.dir({
                    action: 'setPropJSObject(error)',
                    error: err
                });
            }
        }

        setPropJwArray({
            PROP,
            INSTANCE,
            VALUE
        }) {
            if (DEBUG) console.dir({
                action: 'setPropJwArray(entry)',
                PROP,
                INSTANCE,
                VALUE
            });
            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference
            const value = this._convertToNativeValue(VALUE);

            try {
                if (target && (typeof target === 'object' || typeof target === 'function')) {
                    target[PROP] = value;
                } else {
                    const newObj = Object(target);
                    newObj[PROP] = value;
                    INSTANCE.value = newObj;
                }
                if (DEBUG) console.dir({
                    action: 'setPropJwArray(done)',
                    target: INSTANCE.value
                });
            } catch (err) {
                console.error('JS OOP Error in setPropJwArray:', err);
                if (DEBUG) console.dir({
                    action: 'setPropJwArray(error)',
                    error: err
                });
            }
        }

        setPropDogeiscutObject({
            PROP,
            INSTANCE,
            VALUE
        }) {
            if (DEBUG) console.dir({
                action: 'setPropDogeiscutObject(entry)',
                PROP,
                INSTANCE,
                VALUE
            });
            const target = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference
            const value = this._convertToNativeValue(VALUE);

            try {
                if (target && (typeof target === 'object' || typeof target === 'function')) {
                    target[PROP] = value;
                } else {
                    const newObj = Object(target);
                    newObj[PROP] = value;
                    INSTANCE.value = newObj;
                }
                if (DEBUG) console.dir({
                    action: 'setPropDogeiscutObject(done)',
                    target: INSTANCE.value
                });
            } catch (err) {
                console.error('JS OOP Error in setPropDogeiscutObject:', err);
                if (DEBUG) console.dir({
                    action: 'setPropDogeiscutObject(error)',
                    error: err
                });
            }
        }

        stringify({
            VALUE
        }) {
            try {
                let inner = VALUE;

                if (VALUE && typeof VALUE === 'object' && VALUE.customId === 'jsObject') {
                    inner = VALUE.value;
                } else if (VALUE instanceof JSObject) {
                    inner = VALUE.value;
                } else {
                    try {
                        inner = JSON.parse(VALUE);
                    } catch {}
                }
                try {
                    return safeSerialize(inner);
                } catch (e) {
                    if (typeof inner === 'function') return inner.toString();
                    return String(inner);
                }
            } catch (err) {
                console.error('JS OOP Error in stringify:', err);
                if (DEBUG) console.dir({
                    action: 'stringify(error)',
                    error: err
                });
                return String(VALUE);
            }
        }

        typeName({
            INSTANCE
        }) {
            const v = this._getActualValue(this._convertToNativeValue(INSTANCE)); // Resolve instance reference
            if (v === null) return 'null';
            if (v === undefined) return 'undefined';
            if (typeof v === 'function') return `function ${v.name || '(anonymous)'}`;
            if (typeof v === 'object') return v.constructor && v.constructor.name ? v.constructor.name : 'Object';
            return typeof v;
        }
    }

    Scratch.extensions.register(new JSOOPExtension());
})(Scratch);
