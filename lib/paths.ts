import { join } from "node:path";

export const DATA_DIR = process.env.KQK_DATA_DIR ?? join(process.cwd(), "data");
