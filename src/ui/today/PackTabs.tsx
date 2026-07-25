import type { ContentPack } from "../../domain/types";

interface PackTabsProps {
  packs: ContentPack[];
  focusedPackId: string | null;
  onSelect: (packId: string) => void;
}

export function PackTabs({ packs, focusedPackId, onSelect }: PackTabsProps) {
  if (packs.length <= 1) {
    return null;
  }

  return (
    <nav className="pack-tabs" aria-label="Content packs">
      {packs.map((pack) => {
        const active = pack.id === focusedPackId;
        return (
          <button
            key={pack.id}
            type="button"
            className={
              active ? "pack-tabs__tab pack-tabs__tab--active" : "pack-tabs__tab"
            }
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(pack.id)}
          >
            {pack.name}
          </button>
        );
      })}
    </nav>
  );
}
