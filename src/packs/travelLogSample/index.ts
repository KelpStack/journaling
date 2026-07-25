import type { ContentPack } from "../../domain/types";
import type { BundleManifest } from "../manifest";
import manifestJson from "./manifest.json";
import travelLogPackJson from "./content/travel-log.json";

export const TRAVEL_LOG_BUNDLE_MANIFEST = manifestJson as BundleManifest;
export const TRAVEL_LOG_PACK = travelLogPackJson as ContentPack;
