const ORIGINS = ["", "japans", "australisch", "amerikaans", "iers", "nederlands", "europees"];

export function Filters({
  minKorting,
  maxPerKilo,
  herkomst,
}: {
  minKorting: string;
  maxPerKilo: string;
  herkomst: string;
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-fat bg-marbling p-4"
    >
      <label className="text-sm">
        <span className="block text-neutral-600">Min. korting (%)</span>
        <input
          type="number"
          name="minKorting"
          min={0}
          max={90}
          defaultValue={minKorting}
          className="mt-1 w-28 rounded-md border border-fat bg-white px-2 py-1"
        />
      </label>

      <label className="text-sm">
        <span className="block text-neutral-600">Max. € per kilo</span>
        <input
          type="number"
          name="maxPerKilo"
          min={0}
          step={10}
          defaultValue={maxPerKilo}
          className="mt-1 w-32 rounded-md border border-fat bg-white px-2 py-1"
        />
      </label>

      <label className="text-sm">
        <span className="block text-neutral-600">Herkomst</span>
        <select
          name="herkomst"
          defaultValue={herkomst}
          className="mt-1 rounded-md border border-fat bg-white px-2 py-1"
        >
          {ORIGINS.map((o) => (
            <option key={o} value={o}>
              {o === "" ? "alle" : o}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-md bg-beef px-4 py-2 text-sm font-semibold text-white hover:bg-beef-soft"
      >
        Filter
      </button>
    </form>
  );
}
