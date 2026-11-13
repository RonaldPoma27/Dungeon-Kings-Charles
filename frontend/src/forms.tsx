import { useState } from "react";
import { abilities, classes, type Character, type Pool } from "./types";
export function Field({
  label,
  name,
  type = "text",
  options,
  value,
  required = true,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  options?: readonly string[];
  value?: string | number;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label}
      {options ? (
        <select name={name} defaultValue={value}>
          {options.map((v) => (
            <option key={v} value={v}>
              {v || "Automática"}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          min={min}
          max={max}
          required={required}
          defaultValue={value}
        />
      )}
    </label>
  );
}
export function dataOf(form: HTMLFormElement) {
  const data: Record<string, string | number | boolean> = {};
  for (const el of Array.from(form.elements)) {
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
    ) {
      if (el.name)
        data[el.name] =
          el instanceof HTMLInputElement && el.type === "checkbox"
            ? el.checked
            : el.type === "number"
              ? Number(el.value)
              : el.value;
    }
  }
  return data;
}
export function Profile({
  character: c,
  save,
}: {
  character?: Character;
  save: (d: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <form
      className="gridform"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = dataOf(e.currentTarget);
        const scores = Object.fromEntries(abilities.map((k) => [k, d[k]]));
        abilities.forEach((k) => delete d[k]);
        await save({ ...d, abilities: scores, die: Number(d.die) });
      }}
    >
      <Field name="name" label="Nombre del personaje" value={c?.name} />
      <Field name="race" label="Raza" value={c?.race} />
      <Field
        name="profession"
        label="Clase"
        options={classes}
        value={c?.profession}
      />
      <Field
        name="level"
        label="Nivel"
        type="number"
        min={1}
        max={20}
        value={c?.level ?? 1}
      />
      <Field
        name="ac"
        label="Clase de Armadura"
        type="number"
        min={1}
        max={40}
        value={c?.ac ?? 10}
      />
      <Field
        name="max_hp"
        label="PG máximos"
        type="number"
        min={1}
        max={999}
        value={c?.max_hp ?? 10}
      />
      <Field
        name="initiative"
        label="Bono de iniciativa"
        type="number"
        value={c?.initiative ?? 0}
      />
      <Field
        name="die"
        label="Caras del Dado de Golpe"
        options={["6", "8", "10", "12"]}
        value={c?.die ?? 8}
      />
      <Field
        name="casting_override"
        label="Característica de lanzamiento"
        options={["", "INT", "SAB", "CAR"]}
        value={c?.casting_override}
      />
      {abilities.map((k) => (
        <Field
          key={k}
          name={k}
          label={k}
          type="number"
          value={c?.abilities[k] ?? 10}
          min={1}
          max={30}
        />
      ))}
      <button className="primary">Guardar personaje</button>
    </form>
  );
}
export function Editor({
  pool,
  save,
  values = {},
}: {
  pool: Pool;
  save: (d: Record<string, unknown>) => Promise<boolean>;
  values?: Record<string, unknown>;
}) {
  const [key, setKey] = useState(0);
  const f = (
    name: string,
    label: string,
    value: string | number = "",
    opts?: readonly string[],
    type = "text",
    required = true,
  ) => (
    <Field
      name={name}
      label={label}
      value={(values[name] ?? value) as string | number}
      options={opts}
      type={type}
      required={required}
    />
  );
  const check = (name: string, label: string, v = false) => (
    <label className="check">
      <input
        type="checkbox"
        name={name}
        defaultChecked={Boolean(values[name] ?? v)}
      />
      {label}
    </label>
  );
  return (
    <details className="editor">
      <summary>{values.id ? "Editar" : "Agregar o configurar"}</summary>
      <form
        key={key}
        className="gridform"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          if (await save(dataOf(form))) {
            form.closest("details")?.removeAttribute("open");
            setKey(key + 1);
          }
        }}
      >
        {pool !== "slots" && f("name", "Nombre")}
        {pool === "actions" && (
          <>
            {f("kind", "Tipo", "Acción", ["Acción", "Adicional", "Reacción"])}
            {f("ability", "Característica", "FUE", abilities)}
            {f("damage", "Dados de daño", "1d8")}
            <label>
              Descripción de la acción
              <textarea
                rows={4}
                name="description"
                defaultValue={String(values.description ?? "")}
              />
            </label>
            {check("proficient", "Aplica competencia", true)}
          </>
        )}
        {pool === "spells" && (
          <>
            {f("level", "Nivel (0 a 9)", 0, undefined, "number")}
            {f("time", "Tiempo de lanzamiento", "1 acción")}
            {f("reach", "Alcance")}
            {f("components", "Componentes")}
            {f("duration", "Duración")}
            <label>
              Descripción
              <textarea
                name="description"
                rows={5}
                required
                defaultValue={String(values.description ?? "")}
              />
            </label>
            {f("school", "Escuela", "", undefined, "text", false)}
            {check("ritual", "Ritual")}
            {check("concentration", "Requiere concentración")}
            {check("prepared", "Preparado", true)}
          </>
        )}
        {pool === "slots" &&
          f("level", "Nivel de espacio (1 a 9)", 1, undefined, "number")}
        {(pool === "slots" || pool === "resources") &&
          f("maximum", "Máximo", 2, undefined, "number")}
        {pool === "resources" && (
          <>
            <label>
              Recuperación
              <select
                name="recharge"
                defaultValue={String(values.recharge ?? "short")}
              >
                <option value="short">Descanso breve</option>
                <option value="long">Descanso prolongado</option>
              </select>
            </label>
            {check("bardic", "Inspiración de Bardo (dado escalable)")}
          </>
        )}
        {pool === "items" && (
          <>
            {f("quantity", "Unidades", 1, undefined, "number")}
            {f(
              "effect",
              "Tirada de efecto (opcional)",
              "",
              undefined,
              "text",
              false,
            )}
            {check("heals", "El efecto cura PG")}
          </>
        )}
        <button className="primary">Guardar</button>
      </form>
    </details>
  );
}
