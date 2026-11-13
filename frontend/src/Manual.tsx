import { useEffect, useState } from "react";
import { manualActions, manualSpells } from "./api";
import type { Character, Play, Spell, StandardAction } from "./types";

export function ManualActions({ play }: { play: Play }) {
  const [rows, setRows] = useState<StandardAction[]>([]);
  const [error, setError] = useState(""),
    [attempt, retry] = useState(0);
  useEffect(() => {
    let live = true;
    manualActions()
      .then((data) => {
        if (live) {
          setRows(data);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  return (
    <section>
      <h3>Acciones estándar</h3>
      {error && (
        <p role="alert">
          {error} <button onClick={() => retry(attempt + 1)}>Reintentar</button>
        </p>
      )}
      {rows.map((row) => (
        <details className="manual-rule" key={row.id}>
          <summary>{row.name}</summary>
          <p>{row.description}</p>
          <button onClick={() => play({ op: "standard", text: row.name })}>
            Registrar acción
          </button>
        </details>
      ))}
    </section>
  );
}

const casters = [
  "Bardo",
  "Brujo",
  "Clérigo",
  "Druida",
  "Explorador",
  "Hechicero",
  "Mago",
  "Paladín",
];
export function ManualSpells({ c, play }: { c: Character; play: Play }) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState("");
  const [profession, setProfession] = useState(
    casters.includes(c.profession) ? c.profession : "",
  );
  const [level, setLevel] = useState(""),
    [rows, setRows] = useState<Spell[]>([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      manualSpells(name, profession, level)
        .then((data) => {
          if (live) setRows(data);
        })
        .catch((e) => {
          if (live) setError(String(e));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, name, profession, level, attempt]);
  return (
    <section>
      <h3>
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          Conjuros del Manual {open ? "−" : "+"}
        </button>
      </h3>
      {open && (
        <>
          <div className="gridform">
            <label>
              Buscar por nombre
              <input
                type="search"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Clase del catálogo
              <select
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
              >
                <option value="">Todas las clases</option>
                {casters.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label>
              Nivel del catálogo
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="">Todos los niveles</option>
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={i}>
                    {i ? "Nivel " + i : "Trucos"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {loading ? (
            <p role="status">Buscando conjuros…</p>
          ) : error ? (
            <p role="alert">
              {error}{" "}
              <button onClick={() => retry(attempt + 1)}>Reintentar</button>
            </p>
          ) : (
            <>
              <small role="status">
                {rows.length ? rows.length + " conjuros" : "Sin coincidencias"}
              </small>
              <div className="manual-results">
                {rows.map((s) => {
                  const known = c.spells.some((x) => x.catalog === s.id);
                  return (
                    <details key={s.id} className="manual-rule">
                      <summary>
                        {s.name} · {s.level ? "Nivel " + s.level : "Truco"}
                      </summary>
                      <p>
                        {s.school} · {s.classes.join(", ")} · pág.{" "}
                        {s.source_page}
                      </p>
                      <p>
                        {s.casting_time} · {s.range} · {s.components} ·{" "}
                        {s.duration}
                        {s.ritual && " · Ritual"}
                        {s.concentration && " · Concentración"}
                      </p>
                      <p className="rule-text">{s.description}</p>
                      <button
                        disabled={known}
                        onClick={() => play({ op: "learn", id: s.id })}
                      >
                        {known ? "En tu grimorio" : "Agregar al grimorio"}
                      </button>
                    </details>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
