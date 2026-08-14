export const sanitizeProjectFiles = (
  rawFiles: Record<string, any>,
): Record<string, any> => {
  if (!rawFiles || typeof rawFiles !== "object") return {};

  const cleanMap: Record<string, any> = {};
  const validPaths: string[] = [];

  // 1. Filter out macOS metadata, node_modules, git directories, etc.
  Object.keys(rawFiles).forEach((path) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const parts = normalizedPath.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1] || "";

    // Ignore junk files
    if (
      normalizedPath.includes("__MACOSX") ||
      normalizedPath.includes("/node_modules/") ||
      normalizedPath.includes("/.git/") ||
      fileName.startsWith("._") ||
      fileName === ".DS_Store" ||
      fileName === "Thumbs.db"
    ) {
      return;
    }

    cleanMap[normalizedPath] = rawFiles[path];
    validPaths.push(normalizedPath);
  });

  if (validPaths.length === 0) return {};

  // 2. Check if all files are wrapped inside a single top-level root folder
  // Example: ["/insure-landing-page/index.html", "/insure-landing-page/style.css"]
  const rootSegments = new Set(
    validPaths.map((p) => p.split("/").filter(Boolean)[0]),
  );

  let prefixToStrip = "";
  if (rootSegments.size === 1) {
    const singleFolder = Array.from(rootSegments)[0];
    const allHaveSubpaths = validPaths.every((p) => {
      const parts = p.split("/").filter(Boolean);
      return parts.length > 1 && parts[0] === singleFolder;
    });

    if (allHaveSubpaths) {
      prefixToStrip = `/${singleFolder}`;
    }
  }

  // 3. Re-key files with stripped root folder so index.html lands at "/index.html"
  const finalMap: Record<string, any> = {};
  Object.keys(cleanMap).forEach((path) => {
    let newPath = path;
    if (prefixToStrip && newPath.startsWith(prefixToStrip)) {
      newPath = newPath.slice(prefixToStrip.length);
    }
    if (!newPath.startsWith("/")) {
      newPath = `/${newPath}`;
    }
    finalMap[newPath] = cleanMap[path];
  });

  return finalMap;
};
