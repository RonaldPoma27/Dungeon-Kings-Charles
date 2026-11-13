import { useEffect, useRef, useState } from "react";
import Sheet from "./Sheet";
import { api } from "./api";
import type { Character, Command, Room } from "./types";
function project(c: Character, cmd: Command): Character {
  const next = structuredClone(c),
    v = cmd.value ?? 0;
  if (cmd.op === "hp") {
    const absorbed = v < 0 ? Math.min(-v, next.temp) : 0;
    next.temp -= absorbed;
    next.hp = Math.max(0, Math.min(next.max_hp, next.hp + v + absorbed));
    if (next.hp > 0) {
      next.successes = 0;
      next.failures = 0;
    } else next.concentration = "";
  } else if (cmd.op === "temp") next.temp = v;
  else if (cmd.op === "coin" && cmd.text) next.coins[cmd.text] += v;
  else if (cmd.op === "resources" || cmd.op === "slots") {
    const row = next[cmd.op].find((r) => r.id === cmd.id);
    if (row) row.left += v;
  } else if (cmd.op === "items" || cmd.op === "consume") {
    const row = next.items.find((r) => r.id === cmd.id);
    if (row) row.quantity += cmd.op === "consume" ? -1 : v;
  }
  return next;
}
function DM({ room: r, turn }: { room: Room; turn: (op: string) => void }) {
  return (
    <>
      <div className="sectionhead">
        <h2>Panel del Dungeon Master</h2>
        <span>{r.characters.length} / 10 jugadores</span>
      </div>
      <section className="encounter">
        <span className="eyebrow">Iniciativa grupal</span>
        <h3>
          {r.round
            ? "Ronda " +
              r.round +
              " · " +
              r.characters.find((c) => c.id === r.turn)?.name
            : "Fuera de combate"}
        </h3>
        {r.round > 0 && (
          <ol>
            {r.order.map((id) => (
              <li key={id} className={r.turn === id ? "current" : ""}>
                {r.characters.find((c) => c.id === id)?.name}
              </li>
            ))}
          </ol>
        )}
        <div className="row">
          {r.round ? (
            <>
              <button onClick={() => turn("next")}>Siguiente turno →</button>
              <button onClick={() => turn("end")}>Terminar encuentro</button>
            </>
          ) : (
            <button
              disabled={!r.characters.length}
              onClick={() => turn("start")}
            >
              Tirar iniciativa
            </button>
          )}
        </div>
      </section>
      <div className="cards">
        {r.characters.map((c) => (
          <article key={c.id}>
            <span className="eyebrow">
              {c.profession} · Nivel {c.level}
            </span>
            <h3>{c.name}</h3>
            <small>
              {c.last_seen && Date.now() - Date.parse(c.last_seen) < 65000
                ? "En línea"
                : "Sin actividad reciente"}
            </small>
            <div className="metrics">
              <b>
                {c.hp}/{c.max_hp} PG
              </b>
              <span>Temp. {c.temp}</span>
              <span>CA {c.ac}</span>
            </div>
            <progress value={c.hp} max={c.max_hp} />
            <p>{c.conditions || "Sin estados alterados"}</p>
            {c.concentration && <p>Concentración · {c.concentration}</p>}
            <small>Espacios</small>
            <p>
              {c.slots
                .map((s) => "N" + s.level + " · " + s.left + "/" + s.maximum)
                .join("　") || "Sin espacios"}
            </p>
            <small>Recursos</small>
            <p>
              {c.resources
                .map((x) => x.name + " " + x.left + "/" + x.maximum)
                .join("　") || "Sin recursos"}
            </p>
          </article>
        ))}
      </div>
      {!r.characters.length && (
        <p>Compartí el código de invitación para sumar al primer personaje.</p>
      )}
    </>
  );
}
export default function Table({
  id,
  me,
  back,
}: {
  id: number;
  me: number;
  back: () => void;
}) {
  const [room, setRoom] = useState<Room | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true);
  const current = useRef<Room | null>(null),
    lock = useRef(false),
    epoch = useRef(0),
    mounted = useRef(true);
  function display(r: Room) {
    current.current = r;
    setRoom(r);
  }
  const [, setClock] = useState(0);
  const heartbeat = useRef(0);
  async function load(force = false) {
    const tag = epoch.current;
    const pulse = Date.now() > heartbeat.current && current.current?.dm !== me;
    const r = await api<Room | null>(
      "/rooms/" +
        id +
        "/?presence=" +
        (pulse ? "1" : "0") +
        "&since=" +
        (force ? "" : (current.current?.revision ?? "")),
    );
    if (pulse) heartbeat.current = Date.now() + 30000;
    if (!mounted.current || tag !== epoch.current) return;
    if (r && r.revision >= (current.current?.revision ?? 0)) display(r);
    setClock(Math.floor(Date.now() / 10000));
    setOnline(true);
  }
  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!lock.current && !document.hidden) await load();
      } catch (e) {
        if (mounted.current) {
          setOnline(false);
          if (!current.current) setError(String(e));
        }
      } finally {
        if (mounted.current) timer = setTimeout(poll, 2200);
      }
    };
    void poll();
    return () => {
      mounted.current = false;
      epoch.current++;
      clearTimeout(timer);
    };
  }, [id]);
  async function execute(cmd: Command, isTurn = false) {
    const r = current.current,
      c = r?.characters.find((ch) => ch.owner === me);
    if (!r || lock.current || (!isTurn && !c)) return false;
    lock.current = true;
    epoch.current++;
    setBusy(true);
    setError("");
    let committed = false;
    try {
      if (c && !isTurn)
        setRoom({
          ...r,
          characters: r.characters.map((ch) =>
            ch.id === c.id ? project(c, cmd) : ch,
          ),
        });
      await api(
        "/rooms/" + id + "/" + (isTurn ? "turn/" : "characters/" + c!.id + "/"),
        "PATCH",
        { ...cmd, version: isTurn ? r.revision : c!.version },
      );
      committed = true;
      await load(true);
      return true;
    } catch (e) {
      if (!committed) setRoom(r);
      setError(
        committed
          ? "Acción recibida. Reconectando para confirmar el estado."
          : String(e),
      );
      try {
        await load(true);
      } catch {
        setOnline(false);
      }
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const c = room?.characters.find((ch) => ch.owner === me);
  return (
    <>
      <div className="row breadcrumb">
        <button onClick={back}>← Mis mesas</button>
        <small role="status">
          {busy
            ? "Guardando…"
            : online
              ? "Sincronización activa"
              : "Reconectando…"}
        </small>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {room ? (
        <>
          <div className="sectionhead">
            <h1>{room.name}</h1>
            <span className="invite">
              Código <b>{room.code}</b>
            </span>
          </div>
          <fieldset disabled={busy || !online}>
            {room.dm === me ? (
              <DM room={room} turn={(op) => execute({ op }, true)} />
            ) : (
              c && <Sheet c={c} play={execute} />
            )}
          </fieldset>
          <section className="history">
            <h3>Historial de la sala</h3>
            {!room.events.length && <p>Las tiradas aparecerán acá.</p>}
            {room.events.map((e) => (
              <div key={e.id}>
                <time>
                  {new Date(e.at).toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {e.text}
              </div>
            ))}
          </section>
        </>
      ) : (
        <p>Cargando mesa…</p>
      )}
    </>
  );
}
