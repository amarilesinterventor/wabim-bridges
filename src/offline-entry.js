// Punto de entrada para empaquetar (con esbuild) los plugins de Capacitor
// que la app offline necesita en un solo archivo ESM autocontenido
// (public/vendor/capacitor-bundle.js) — ver "build:offline" en package.json.
// Los paquetes @capacitor/* publican ESM con especificadores "bare" (p.ej.
// `import ... from "@capacitor/core"`) que un navegador no puede resolver sin
// bundler ni import map; como el resto del frontend es JS vanilla sin paso de
// build, se resuelve una sola vez aquí en vez de introducir un bundler para
// todo el proyecto.
export { Capacitor } from "@capacitor/core";
export { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
export { Share } from "@capacitor/share";
export { Geolocation } from "@capacitor/geolocation";
