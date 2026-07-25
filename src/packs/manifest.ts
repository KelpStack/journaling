export interface BundleManifest {
  name: string;
  version: string;
  skinIds?: string[];
  contentPackIds?: string[];
  activateOnImport?: { skinId?: string; contentPackIds?: string[] };
}

export function parseBundleManifest(raw: unknown): BundleManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid manifest: expected an object");
  }

  const m = raw as Record<string, unknown>;

  if (typeof m.name !== "string" || m.name.trim() === "") {
    throw new Error("Invalid manifest: name is required");
  }
  if (typeof m.version !== "string" || m.version.trim() === "") {
    throw new Error("Invalid manifest: version is required");
  }

  const manifest: BundleManifest = {
    name: m.name,
    version: m.version,
  };

  if (m.skinIds !== undefined) {
    if (!Array.isArray(m.skinIds) || !m.skinIds.every((id) => typeof id === "string")) {
      throw new Error("Invalid manifest: skinIds must be string[]");
    }
    manifest.skinIds = m.skinIds;
  }

  if (m.contentPackIds !== undefined) {
    if (
      !Array.isArray(m.contentPackIds) ||
      !m.contentPackIds.every((id) => typeof id === "string")
    ) {
      throw new Error("Invalid manifest: contentPackIds must be string[]");
    }
    manifest.contentPackIds = m.contentPackIds;
  }

  if (m.activateOnImport !== undefined) {
    if (!m.activateOnImport || typeof m.activateOnImport !== "object") {
      throw new Error("Invalid manifest: activateOnImport must be an object");
    }
    const activation = m.activateOnImport as Record<string, unknown>;
    manifest.activateOnImport = {};
    if (activation.skinId !== undefined) {
      if (typeof activation.skinId !== "string") {
        throw new Error("Invalid manifest: activateOnImport.skinId must be a string");
      }
      manifest.activateOnImport.skinId = activation.skinId;
    }
    if (activation.contentPackIds !== undefined) {
      if (
        !Array.isArray(activation.contentPackIds) ||
        !activation.contentPackIds.every((id) => typeof id === "string")
      ) {
        throw new Error("Invalid manifest: activateOnImport.contentPackIds must be string[]");
      }
      manifest.activateOnImport.contentPackIds = activation.contentPackIds;
    }
  }

  return manifest;
}
