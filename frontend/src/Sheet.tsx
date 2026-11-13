import { useState } from "react";
import { Editor, Profile } from "./forms";
import { mod, sign, type Character, type Play, type Pool } from "./types";
type Props = { c: Character; play: Play };
const tabs = ["Acciones", "Conjuros", "Recursos", "Consumibles"];
function Step({
  value,
  step,
  maximum,
}: {
  value: number;
  step: (n: number) => void;
  maximum?: number;
}) {
  return (
    <div className="step">
      <button
        disabled={value <= 0}
        aria-label="Restar uno"
        onClick={() => step(-1)}
      >
        −
      </button>
      <b>
        {value}
        {maximum !== undefined && " / " + maximum}
      </b>
      <button
        disabled={maximum !== undefined && value >= maximum}
        aria-label="Sumar uno"
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  );
}
function Survival({ c, play }: Props) {
  const [spend, setSpend] = useState(0);
  return (
    <>
      <header className="survival">
        <div>
          <span className="eyebrow">
            {c.race} · {c.profession} · Nivel {c.level}
          </span>
          <h2>{c.name}</h2>
        </div>
        <div className="metrics">
          <b>
            {c.hp}/{c.max_hp} PG
          </b>
          <span>CA {c.ac}</span>
          <span>Inic. {sign(c.initiative)}</span>
          <span>Comp. +{c.proficiency}</span>
        </div>
        <div className="row">
          {[-5, -1, 1, 5].map((n) => (
            <button key={n} onClick={() => play({ op: "hp", value: n })}>
              {sign(n)}
            </button>
          ))}
          <button
            onClick={() => {
              const n = prompt("PG temporales actuales", String(c.temp));
              if (n !== null && /^\d+$/.test(n))
                void play({ op: "temp", value: Number(n) });
            }}
          >
            Temp. {c.temp}
          </button>
        </div>
        {c.hp === 0 && (
          <div className="row">
            {(["successes", "failures"] as const).map((k) => (
              <div key={k}>
                {k === "successes" ? "Éxitos" : "Fallos"}{" "}
                {[1, 2, 3].map((n) => (
                  <input
                    key={n}
                    aria-label={k + " " + n}
                    type="checkbox"
                    checked={c[k] >= n}
                    onChange={() =>
                      play({
                        op: "death",
                        text: k,
                        value: c[k] >= n ? n - 1 : n,
                      })
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </header>
      <div className="row tools">
        <details>
          <summary>Descansar</summary>
          <div className="panel">
            <label>
              Dados a gastar ({c.dice_left}d{c.die} disponibles)
              <input
                type="number"
                min={0}
                max={c.dice_left}
                value={spend}
                onChange={(e) => setSpend(Number(e.target.value))}
              />
            </label>
            <button
              onClick={async () => {
                if (await play({ op: "rest", text: "short", value: spend }))
                  setSpend(0);
              }}
            >
              Descanso breve
            </button>
            <button
              onClick={() =>
                confirm("¿Completar el descanso prolongado?") &&
                play({ op: "rest", text: "long" })
              }
            >
              Descanso prolongado
            </button>
          </div>
        </details>
        <button
          onClick={() => {
            const s = prompt("Estados alterados", c.conditions);
            if (s !== null) void play({ op: "conditions", text: s });
          }}
        >
          {c.conditions || "Sin estados alterados"}
        </button>
      </div>
    </>
  );
}
function Actions({ c, play }: Props) {
  const [mode, setMode] = useState("normal"),
    [formula, setFormula] = useState("1d20");
  return (
    <>
      <div className="roller">
        <label>
          Tirada libre
          <input value={formula} onChange={(e) => setFormula(e.target.value)} />
        </label>
        <label>
          Modalidad
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {["normal", "ventaja", "desventaja"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <button
          className="gold"
          onClick={() => play({ op: "roll", text: formula, mode })}
        >
          Lanzar dados
        </button>
      </div>
      {["Acción", "Adicional", "Reacción"].map((k) => (
        <section key={k}>
          <h3>{k === "Adicional" ? "Acción adicional" : k}</h3>
          {c.actions
            .filter((a) => a.kind === k)
            .map((a) => (
              <article key={a.id}>
                <strong>{a.name}</strong>
                <div className="row">
                  <button
                    onClick={() => play({ op: "attack", id: a.id, mode })}
                  >
                    Ataque{" "}
                    {sign(
                      mod(c, a.ability) + (a.proficient ? c.proficiency : 0),
                    )}
                  </button>
                  <button onClick={() => play({ op: "damage", id: a.id })}>
                    Daño {a.damage}
                    {sign(mod(c, a.ability))}
                  </button>
                </div>
              </article>
            ))}
        </section>
      ))}
      <Editor
        pool="actions"
        save={(data) => play({ op: "setup", pool: "actions", data })}
      />
      <h3>Acciones estándar</h3>
      <div className="row">
        {[
          "Atacar",
          "Correr",
          "Destrabarse",
          "Esquivar",
          "Ayudar",
          "Esconderse",
          "Preparar",
        ].map((text) => (
          <button key={text} onClick={() => play({ op: "standard", text })}>
            {text}
          </button>
        ))}
      </div>
    </>
  );
}
function Spells({ c, play }: Props) {
  const [filter, setFilter] = useState("todos"),
    [prepared, setPrepared] = useState(false);
  return (
    <>
      {c.casting && (
        <div className="metrics">
          <b>CD {8 + c.proficiency + mod(c, c.casting)}</b>
          <span>
            Ataque {sign(c.proficiency + mod(c, c.casting))} · {c.casting}
          </span>
        </div>
      )}
      {c.concentration && (
        <div className="alert">
          Concentración · {c.concentration}{" "}
          <button onClick={() => play({ op: "release" })}>Finalizar</button>
        </div>
      )}
      <h3>Espacios de conjuro</h3>
      {[...c.slots]
        .sort((a, b) => a.level - b.level)
        .map((s) => (
          <article key={s.id}>
            <b>Nivel {s.level}</b>
            <div className="row">
              {Array.from({ length: s.maximum }, (_, i) => (
                <button
                  key={i}
                  aria-label={"Espacio " + (i + 1)}
                  aria-pressed={i < s.left}
                  onClick={() =>
                    play({ op: "slots", id: s.id, value: i < s.left ? -1 : 1 })
                  }
                >
                  {i < s.left ? "◆" : "◇"}
                </button>
              ))}
            </div>
            <Editor
              pool="slots"
              values={{ ...s }}
              save={(data) =>
                play({ op: "setup", pool: "slots", id: s.id, data })
              }
            />
          </article>
        ))}
      <Editor
        pool="slots"
        save={(data) => play({ op: "setup", pool: "slots", data })}
      />
      <h3>Grimorio</h3>
      <div className="row">
        <label>
          Nivel
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="todos">Todos</option>
            {Array.from({ length: 10 }, (_, i) => (
              <option value={i} key={i}>
                {i ? "Nivel " + i : "Trucos"}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={prepared}
            onChange={(e) => setPrepared(e.target.checked)}
          />
          Solo preparados
        </label>
      </div>
      {c.spells
        .filter(
          (s) =>
            (filter === "todos" || s.level === Number(filter)) &&
            (!prepared || s.prepared),
        )
        .map((s) => (
          <article key={s.id}>
            <h4>{s.name}</h4>
            <small>
              {s.level ? "Nivel " + s.level : "Truco"} · {s.time} · {s.reach} ·{" "}
              {s.components} · {s.duration}
              {s.concentration && " · Concentración"}
            </small>
            <p>{s.description}</p>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const replace = !!(s.concentration && c.concentration);
                if (
                  !replace ||
                  confirm(
                    "¿Reemplazar la concentración en " + c.concentration + "?",
                  )
                )
                  void play({
                    op: "cast",
                    id: s.id,
                    value: Number(
                      new FormData(e.currentTarget).get("level") || 0,
                    ),
                    replace,
                  });
              }}
            >
              {s.level > 0 && (
                <select aria-label="Espacio a gastar" name="level" required>
                  <option value="">Elegir espacio</option>
                  {c.slots
                    .filter((x) => x.level >= s.level && x.left)
                    .map((x) => (
                      <option key={x.id} value={x.level}>
                        Nivel {x.level} · {x.left} disp.
                      </option>
                    ))}
                </select>
              )}
              <button>Lanzar</button>
            </form>
            <Editor
              pool="spells"
              values={{ ...s }}
              save={(data) =>
                play({ op: "setup", pool: "spells", id: s.id, data })
              }
            />
          </article>
        ))}
      <Editor
        pool="spells"
        save={(data) => play({ op: "setup", pool: "spells", data })}
      />
    </>
  );
}
function Supplies({ c, play, pool }: Props & { pool: "resources" | "items" }) {
  return (
    <>
      {pool === "resources"
        ? c.resources.map((r) => (
            <article key={r.id}>
              <h4>
                {r.name}{" "}
                {r.bardic &&
                  "· d" +
                    (c.level >= 15
                      ? 12
                      : c.level >= 10
                        ? 10
                        : c.level >= 5
                          ? 8
                          : 6)}
              </h4>
              <small>
                Recupera en descanso{" "}
                {r.recharge === "short" ? "breve" : "prolongado"}
              </small>
              <Step
                value={r.left}
                maximum={r.maximum}
                step={(value) => play({ op: pool, id: r.id, value })}
              />
              <Editor
                pool={pool}
                values={{ ...r }}
                save={(data) => play({ op: "setup", pool, id: r.id, data })}
              />
            </article>
          ))
        : c.items.map((i) => (
            <article key={i.id}>
              <h4>{i.name}</h4>
              <Step
                value={i.quantity}
                step={(value) => play({ op: pool, id: i.id, value })}
              />
              <button
                disabled={!i.quantity}
                onClick={() => play({ op: "consume", id: i.id })}
              >
                Usar {i.effect}
              </button>
            </article>
          ))}
      <Editor
        key={pool}
        pool={pool as Pool}
        save={(data) => play({ op: "setup", pool, data })}
      />
      {pool === "items" && (
        <>
          <h3>Monedero</h3>
          <div className="wallet">
            {Object.entries(c.coins).map(([text, n]) => (
              <div key={text}>
                <strong>{text.toUpperCase()}</strong>
                <Step
                  value={n}
                  step={(value) => play({ op: "coin", text, value })}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
export default function Sheet(p: Props) {
  const [tab, setTab] = useState(0);
  return (
    <>
      <Survival {...p} />
      <nav aria-label="Hoja táctica">
        {tabs.map((t, i) => (
          <button
            key={t}
            className={tab === i ? "active" : ""}
            onClick={() => setTab(i)}
          >
            {t}
          </button>
        ))}
      </nav>
      <section className="paper">
        <h2>{tabs[tab]}</h2>
        {tab === 0 ? (
          <Actions {...p} />
        ) : tab === 1 ? (
          <Spells {...p} />
        ) : (
          <Supplies {...p} pool={tab === 2 ? "resources" : "items"} />
        )}
      </section>
      <details>
        <summary>Editar ficha base</summary>
        <Profile
          character={p.c}
          save={(data) => p.play({ op: "profile", data })}
        />
      </details>
    </>
  );
}
