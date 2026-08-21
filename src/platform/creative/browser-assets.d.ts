declare module '*.wasm?url' { const url: string; export default url }
declare module '*.mjs?url' { const url: string; export default url }
declare module '*.json?raw' { const text: string; export default text }
declare module '*.sig?raw' { const text: string; export default text }
declare module '*.pem?raw' { const text: string; export default text }
