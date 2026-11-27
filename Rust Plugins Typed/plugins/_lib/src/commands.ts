// Chat commands that fill a plugin's text, number and list settings, for builds where Sunbird's
// "Edit" box doesn't open. A value set by command wins over the settings page until it's cleared.
//
//   !<prefix>                        shows the current values
//   !<prefix> <field> <value>        sets a text/number field
//   !<prefix> <field> clear          back to the settings page value
//   !<prefix> [field] add <item>     adds to a list (field optional: first list field)
//   !<prefix> [field] remove <item>  removes from a list
//   !<prefix> [field] set <a, b>     replaces a list
//   !<prefix> [field] clear          empties a list override

export type Kind = "text" | "number" | "list";
export interface Field {
  /** The settings key it fills. */
  key: string;
  kind: Kind;
}

const SPLIT = /\r?\n|,/;
const STORE = (key: string) => `cmd:${key}`;
const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function commands<S extends object>(
  settings: S,
  prefix: string,
  fields: Record<string, Field>,
  onSet?: (key: string) => void,
): S {
  const overrides = new Map<string, unknown>();
  for (const f of Object.values(fields)) {
    const saved = phoenix.storage.get<unknown>(STORE(f.key));
    if (saved !== undefined && saved !== null) overrides.set(f.key, saved);
  }

  const view = new Proxy(settings, {
    get(target, key, receiver) {
      if (typeof key === "string" && overrides.has(key)) return overrides.get(key);
      return Reflect.get(target, key, receiver);
    },
  });

  const read = (key: string) => (view as Record<string, unknown>)[key];
  const items = (key: string) =>
    String(read(key) ?? "")
      .split(SPLIT)
      .map((s) => s.trim())
      .filter(Boolean);

  const save = (key: string, value: unknown) => {
    overrides.set(key, value);
    phoenix.storage.set(STORE(key), value);
    onSet?.(key);
  };
  const reset = (key: string) => {
    overrides.delete(key);
    phoenix.storage.delete(STORE(key));
    onSet?.(key);
  };

  const names = Object.keys(fields);
  const firstList = names.find((n) => fields[n].kind === "list");
  const cmd = `!${prefix}`;

  const summary = () =>
    names
      .map((n) => {
        const f = fields[n];
        const v = f.kind === "list" ? items(f.key).join(", ") : String(read(f.key) ?? "");
        return `${n}: ${v === "" ? "—" : short(v)}`;
      })
      .join(" · ");

  const help = () =>
    `${cmd} ${names
      .map((n) => (fields[n].kind === "list" ? `${n} add|remove|set|clear` : `${n} <value>|clear`))
      .join(" · ")}`;

  phoenix.messages.onSend((text) => {
    const trimmed = text.trim();
    if (trimmed.toLowerCase() !== cmd && !trimmed.toLowerCase().startsWith(`${cmd} `)) return;

    const rest = trimmed.slice(cmd.length).trim();
    if (!rest) {
      phoenix.ui.toast(summary());
      return false;
    }
    if (rest === "help") {
      phoenix.ui.toast(help());
      return false;
    }

    let [first, ...tail] = rest.split(/\s+/);
    let name = names.find((n) => n.toLowerCase() === first.toLowerCase());
    if (!name) {
      // A list op without a field name goes to the first list field.
      if (firstList && ["add", "remove", "set", "clear"].includes(first.toLowerCase())) {
        name = firstList;
        tail = [first, ...tail];
      } else {
        phoenix.ui.toast(`Unknown field "${first}". ${help()}`);
        return false;
      }
    }
    const field = fields[name];
    const value = rest.slice(rest.toLowerCase().indexOf(first.toLowerCase()) + first.length).trim();

    if (field.kind === "list") {
      const op = (tail[0] ?? "").toLowerCase();
      const arg = name === firstList && !names.some((n) => n.toLowerCase() === first.toLowerCase())
        ? rest.slice(op.length).trim()
        : value.slice(op.length).trim();
      const current = items(field.key);
      if (op === "clear") {
        save(field.key, "");
        phoenix.ui.toast(`${name}: cleared`);
      } else if (op === "add" && arg) {
        const add = arg.split(SPLIT).map((s) => s.trim()).filter(Boolean);
        const next = [...current];
        for (const a of add) if (!next.some((c) => c.toLowerCase() === a.toLowerCase())) next.push(a);
        save(field.key, next.join("\n"));
        phoenix.ui.toast(`${name}: ${short(next.join(", "), 150)}`);
      } else if (op === "remove" && arg) {
        const drop = arg.split(SPLIT).map((s) => s.trim().toLowerCase()).filter(Boolean);
        const next = current.filter((c) => !drop.includes(c.toLowerCase()));
        save(field.key, next.join("\n"));
        phoenix.ui.toast(`${name}: ${next.length ? short(next.join(", "), 150) : "—"}`);
      } else if (op === "set") {
        const next = arg.split(SPLIT).map((s) => s.trim()).filter(Boolean);
        save(field.key, next.join("\n"));
        phoenix.ui.toast(`${name}: ${next.length ? short(next.join(", "), 150) : "—"}`);
      } else if (op === "reset") {
        reset(field.key);
        phoenix.ui.toast(`${name}: back to the settings page`);
      } else {
        phoenix.ui.toast(`${cmd} ${name} add|remove|set|clear|reset <items>`);
      }
      return false;
    }

    if (!value) {
      phoenix.ui.toast(`${name}: ${String(read(field.key) ?? "") || "—"}`);
      return false;
    }
    if (value.toLowerCase() === "clear") {
      reset(field.key);
      phoenix.ui.toast(`${name}: back to the settings page`);
      return false;
    }
    if (field.kind === "number") {
      const n = Number(value.replace(",", "."));
      if (!Number.isFinite(n)) {
        phoenix.ui.toast(`${name} needs a number`);
        return false;
      }
      save(field.key, n);
      phoenix.ui.toast(`${name}: ${n}`);
      return false;
    }
    save(field.key, value);
    phoenix.ui.toast(`${name}: ${short(value, 150)}`);
    return false;
  });

  return view;
}
