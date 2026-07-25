import Dexie, { type Table } from "dexie";
import type {
  AnswerValue,
  ContentPack,
  DailyEntry,
  ProfileId,
  ProfileSettings,
  Skin,
} from "../domain/types";

export interface SearchRecord {
  id: string;
  profileId: string;
  date: string;
  text: string;
  contentPackIds: string[];
  completed: boolean;
  answers: Record<string, AnswerValue>;
}

export interface BackupFolderRecord {
  profileId: ProfileId;
  handle: FileSystemDirectoryHandle;
}

export class JournalDB extends Dexie {
  entries!: Table<DailyEntry, string>;
  packs!: Table<ContentPack, string>;
  skins!: Table<Skin, string>;
  settings!: Table<ProfileSettings, string>;
  search!: Table<SearchRecord, string>;
  backupFolders!: Table<BackupFolderRecord, string>;

  constructor() {
    super("hfl_journal");
    this.version(1).stores({
      entries: "id, profileId, date, [profileId+date]",
      packs: "id",
      skins: "id",
      settings: "profileId",
      search: "id, profileId, date, *text",
    });
    this.version(2).stores({
      entries: "id, profileId, date, [profileId+date]",
      packs: "id",
      skins: "id",
      settings: "profileId",
      search: "id, profileId, date, *text",
      backupFolders: "profileId",
    });
  }
}

export const db = new JournalDB();
