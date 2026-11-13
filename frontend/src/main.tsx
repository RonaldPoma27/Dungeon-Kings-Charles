import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, logout } from "./api";
import { Field, Profile } from "./forms";
import Table from "./Table";
import type { LobbyData } from "./types";
import "./style.css";
function App() {
  const [auth, setAuth] = useState(!!sessionStorage.getItem("access")),
    [signup, setSignup] = useState(false),
    [lobby, setLobby] = useState<LobbyData | null>(null),
    [id, setId] = useState<number | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState("");
  const exit = () => {
    logout();
    setAuth(false);
    setLobby(null);
    setId(null);
    setError("");
  };
  useEffect(() => {
    window.addEventListener("signed-out", exit);
    return () => window.removeEventListener("signed-out", exit);
  }, []);
  useEffect(() => {
    let live = true;
    if (auth)
      api<LobbyData>("/lobby/")
        .then((d) => {
          if (live) setLobby(d);
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    return () => {
      live = false;
    };
  }, [auth, refresh]);
  async function run(fn: () => Promise<void>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="mast">
        <div>
          <img src="/icon-192.png" width="36" height="36" alt="" />
          <b>
            Dungeons <i>&amp;</i> Kings Charles
          </b>
        </div>
        {auth && <button onClick={exit}>Salir</button>}
      </header>
      <main>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {!auth ? (
          <div className="login">
            <aside className="cover">
              <span className="eyebrow">Compañero de mesa · 5e</span>
              <div className="diceart" aria-hidden="true">
                ⚄
              </div>
              <h1>
                Dungeons
                <br />
                <i>&amp; Kings Charles</i>
              </h1>
            </aside>
            <div className="loginform">
              <span className="eyebrow">Cuenta de campaña</span>
              <h2>{signup ? "Crear cuenta" : "Entrar a la mesa"}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = Object.fromEntries(
                    new FormData(e.currentTarget),
                  );
                  void run(async () => {
                    if (signup) await api("/register/", "POST", data);
                    const t = await api<{ access: string; refresh: string }>(
                      "/token/",
                      "POST",
                      data,
                    );
                    sessionStorage.setItem("access", t.access);
                    sessionStorage.setItem("refresh", t.refresh);
                    setAuth(true);
                  });
                }}
              >
                <Field label="Usuario" name="username" />
                <Field label="Contraseña" name="password" type="password" />
                {signup && <small>Mínimo 8 caracteres.</small>}
                <button className="primary" disabled={busy}>
                  {signup ? "Registrarme" : "Iniciar sesión"}
                </button>
              </form>
              <button
                className="link"
                onClick={() => {
                  setSignup(!signup);
                  setError("");
                }}
              >
                {signup ? "Ya tengo cuenta" : "Crear una cuenta"}
              </button>
            </div>
          </div>
        ) : !lobby ? (
          <button onClick={() => setRefresh(refresh + 1)}>
            Recargar mis mesas
          </button>
        ) : id ? (
          <Table
            key={id}
            id={id}
            me={lobby.me}
            back={() => {
              setId(null);
              setRefresh(refresh + 1);
            }}
          />
        ) : (
          <>
            <span className="eyebrow">
              Cuaderno de campaña · {lobby.username}
            </span>
            <h1>Mis mesas</h1>
            <section className="cards">
              {lobby.rooms.map((r) => (
                <button
                  className="campaign"
                  key={r.id}
                  onClick={() => setId(r.id)}
                >
                  <small>
                    {r.dm === lobby.me ? "Dungeon Master" : "Jugador"}
                  </small>
                  <h3>{r.name}</h3>
                  <span>Continuar campaña →</span>
                </button>
              ))}
            </section>
            <fieldset disabled={busy}>
              <div className="cards">
                <section className="paper">
                  <span className="eyebrow">Dungeon Master</span>
                  <h2>Crear una sala</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = new FormData(e.currentTarget).get("name");
                      void run(async () => {
                        const r = await api<{ id: number }>("/rooms/", "POST", {
                          name,
                        });
                        setId(r.id);
                      });
                    }}
                  >
                    <Field name="name" label="Nombre de la campaña" />
                    <button className="primary">Crear sala</button>
                  </form>
                </section>
                <section className="paper">
                  <span className="eyebrow">Jugador</span>
                  <h2>Unirme a una sala</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      void run(async () => {
                        const r = await api<{ id: number }>("/join/", "POST", {
                          code: String(d.get("code")).trim().toUpperCase(),
                          character: Number(d.get("character")),
                        });
                        setId(r.id);
                      });
                    }}
                  >
                    <Field name="code" label="Código de 6 caracteres" />
                    <label>
                      Personaje
                      <select
                        name="character"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                        required
                      >
                        <option value="">Elegí una ficha libre</option>
                        {lobby.characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="primary"
                      disabled={!lobby.characters.length}
                    >
                      Vincular y entrar
                    </button>
                  </form>
                  <details>
                    <summary>Crear personaje</summary>
                    <Profile
                      save={(data) =>
                        run(async () => {
                          const c = await api<{ id: number }>(
                            "/characters/",
                            "POST",
                            data,
                          );
                          setSelected(String(c.id));
                          setRefresh(refresh + 1);
                          document
                            .querySelector("details[open]")
                            ?.removeAttribute("open");
                        })
                      }
                    />
                  </details>
                </section>
              </div>
            </fieldset>
          </>
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
