"use client";

import { groupBySite, groupLabel } from "@/lib/people/labels";
import type { GroupItem } from "@/lib/people/types";
import { input } from "@/components/manual/ui";

/** Lista de grupos agrupada por sede. */
export function GroupSelect({
  id, groups, value, onChange, disabled, showCount, label,
}: { id?: string; groups: GroupItem[]; value: string; onChange: (id: string) => void; disabled?: boolean; showCount?: boolean; label: string }) {
  const sites = groupBySite(groups);
  const option = (g: GroupItem) => (
    <option key={g.id} value={g.id}>{groupLabel(g)}{showCount ? ` (${g.memberCount})` : ""}</option>
  );
  return (
    <select id={id} aria-label={label} className={input} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {sites.length > 1
        ? sites.map((s) => <optgroup key={s.siteId} label={s.siteName}>{s.groups.map(option)}</optgroup>)
        : groups.map(option)}
    </select>
  );
}
