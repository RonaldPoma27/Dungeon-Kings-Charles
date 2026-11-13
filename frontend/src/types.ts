export const abilities = ["FUE", "DES", "CON", "INT", "SAB", "CAR"] as const;
export const classes = [
  "Guerrero",
  "Mago",
  "Bardo",
  "Bárbaro",
  "Brujo",
  "Clérigo",
  "Druida",
  "Explorador",
  "Hechicero",
  "Monje",
  "Paladín",
  "Pícaro",
  "Artífice",
];
export type Pool = "actions" | "spells" | "resources" | "items" | "slots";
export type Command = {
  op: string;
  value?: number;
  id?: number;
  text?: string;
  mode?: string;
  pool?: Pool;
  data?: Record<string, unknown>;
  replace?: boolean;
};
export type Play = (cmd: Command) => Promise<boolean>;
export interface Action {
  id: number;
  name: string;
  kind: string;
  ability: string;
  damage: string;
  proficient: boolean;
}
export interface Spell {
  id: number;
  name: string;
  level: number;
  time: string;
  reach: string;
  components: string;
  duration: string;
  description: string;
  concentration: boolean;
  prepared: boolean;
}
export interface Resource {
  id: number;
  name: string;
  maximum: number;
  left: number;
  recharge: string;
  bardic: boolean;
}
export interface Item {
  id: number;
  name: string;
  quantity: number;
  effect: string;
  heals: boolean;
}
export interface Slot {
  id: number;
  level: number;
  maximum: number;
  left: number;
}
export interface Character {
  last_seen: string | null;
  id: number;
  owner: number;
  name: string;
  race: string;
  profession: string;
  level: number;
  proficiency: number;
  abilities: Record<string, number>;
  casting: string;
  casting_override: string;
  hp: number;
  max_hp: number;
  temp: number;
  ac: number;
  initiative: number;
  die: number;
  dice_left: number;
  successes: number;
  failures: number;
  conditions: string;
  concentration: string;
  coins: Record<string, number>;
  actions: Action[];
  spells: Spell[];
  resources: Resource[];
  items: Item[];
  slots: Slot[];
  version: number;
}
export interface Room {
  id: number;
  name: string;
  code: string;
  dm: number;
  round: number;
  turn: number | null;
  order: number[];
  revision: number;
  characters: Character[];
  events: { id: number; at: string; text: string }[];
}
export interface LobbyData {
  me: number;
  username: string;
  rooms: Room[];
  characters: { id: number; name: string }[];
}
export const mod = (c: Character, a: string) =>
  Math.floor((c.abilities[a] - 10) / 2);
export const sign = (n: number) => (n >= 0 ? "+" + n : String(n));
